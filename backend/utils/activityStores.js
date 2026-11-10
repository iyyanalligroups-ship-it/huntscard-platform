// Where activity backups are saved. Both places offer the same functions, so the backup runner does not
// care which one it talks to:
//   ensureFolder(['Activity Logs', 'ID - Name']) -> folderId
//   upload({ folderId, name, buffer, existingId }) -> { id, size }     (existingId = update that file in place)
//   verify(id)                                    -> { exists, trashed, size }
//   findFiles(folderId, name)                     -> [{ id, size, trashed }]
//   trash(id)                                     (the Drive bin / the .trash folder, never a hard delete)
// (a) LocalStore: a private server folder outside any public/static folder -- for testing.
// (b) DriveStore: Google Drive over plain HTTPS (no SDK), scope drive.file only.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---- the saved Google refresh token: AES-256-GCM, key derived from the app secret ----
function secretKey() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return crypto.createHash('sha256').update(`activity-backup:${process.env.JWT_SECRET}`).digest();
}
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}
function decryptSecret(packed) {
  const [v, iv, tag, data] = String(packed || '').split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Saved Google connection is unreadable. Connect Google Drive again.');
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'hex'));
  d.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([d.update(Buffer.from(data, 'hex')), d.final()]).toString('utf8');
}

// A folder or file name that is safe on disk and in Drive.
function safeName(s, max = 120) {
  const out = String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, max).trim();
  return out || '_';
}

// ---------------------------------------------------------------------------------------------
class LocalStore {
  constructor(root) {
    this.place = 'local';
    this.root = path.resolve(root);
  }
  inside(rel) {
    const full = path.resolve(this.root, rel);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error('Path is outside the backup folder');
    return full;
  }
  async ensureFolder(parts) {
    const rel = parts.map((p) => safeName(p)).join('/');
    await fs.promises.mkdir(this.inside(rel), { recursive: true });
    return rel;
  }
  async upload({ folderId, name, buffer }) {
    const rel = `${folderId}/${safeName(name)}`;
    const full = this.inside(rel);
    const tmp = `${full}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.writeFile(tmp, buffer);
    await fs.promises.rename(tmp, full);
    return { id: rel, size: buffer.length };
  }
  async verify(id) {
    try {
      const st = await fs.promises.stat(this.inside(id));
      return { exists: st.isFile(), trashed: false, size: st.size };
    } catch {
      return { exists: false, trashed: false, size: 0 };
    }
  }
  async findFiles(folderId, name) {
    const rel = `${folderId}/${safeName(name)}`;
    const v = await this.verify(rel);
    return v.exists ? [{ id: rel, size: v.size, trashed: false }] : [];
  }
  async trash(id) {
    const from = this.inside(id);
    const to = this.inside(`.trash/${Date.now()}-${path.basename(id)}`);
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    await fs.promises.rename(from, to).catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

// Marks an error that will not get better by trying the next file (connection refused, etc).
function fatal(message) {
  const err = new Error(message);
  err.fatal = true;
  return err;
}

// Gets short-lived access tokens from the saved refresh token and caches them.
function googleTokenSource({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  let cached = null;
  return async function accessToken(force = false) {
    if (!force && cached && cached.expiresAt > Date.now() + 60000) return cached.token;
    const res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      const why = data.error === 'invalid_grant'
        ? 'Google refused the saved connection (it was revoked or expired). Connect Google Drive again.'
        : `Google refused the connection (${data.error || res.status}). Check the Google client ID and secret.`;
      throw fatal(why);
    }
    cached = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    return cached.token;
  };
}

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); // Drive query string escape

class DriveStore {
  // rootName: the top folder this app creates in the admin's Drive. With scope drive.file the app only
  // ever sees what it created itself.
  constructor({ accessToken, rootName = 'HuntsTAG', fetchImpl = fetch }) {
    this.place = 'drive';
    this.accessToken = accessToken;
    this.rootName = rootName;
    this.fetch = fetchImpl;
    this.folders = new Map(); // 'a/b' -> id (kept for one run)
  }

  async call(url, init = {}, attempt = 0, refreshed = false) {
    const token = await this.accessToken(refreshed);
    const res = await this.fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } });
    if (res.status === 401 && !refreshed) return this.call(url, init, attempt, true);
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      return this.call(url, init, attempt + 1, refreshed);
    }
    return res;
  }

  async json(url, init) {
    const res = await this.call(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      const err = new Error(`Google Drive said: ${msg}`);
      err.status = res.status;
      if (res.status === 401 || res.status === 403) {
        if (/storageQuota|quota|rate/i.test(msg)) throw err;
        throw fatal(`Google Drive refused access: ${msg}`);
      }
      throw err;
    }
    return data;
  }

  async findFolder(name, parentId) {
    const parent = parentId ? ` and '${q(parentId)}' in parents` : '';
    const out = await this.json(`${DRIVE_API}/files?${new URLSearchParams({
      q: `mimeType='application/vnd.google-apps.folder' and name='${q(name)}' and trashed=false${parent}`,
      fields: 'files(id)', spaces: 'drive', pageSize: '10',
    })}`);
    return out.files?.[0]?.id || null;
  }

  async ensureFolder(parts) {
    let parentId = null;
    let key = '';
    for (const part of [this.rootName, ...parts.map((p) => safeName(p))]) {
      key = key ? `${key}/${part}` : part;
      let id = this.folders.get(key);
      if (!id) {
        id = await this.findFolder(part, parentId);
        if (!id) {
          const made = await this.json(`${DRIVE_API}/files?fields=id`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: part, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
          });
          id = made.id;
        }
        this.folders.set(key, id);
      }
      parentId = id;
    }
    return parentId;
  }

  async upload({ folderId, name, buffer, existingId }) {
    const boundary = `b${crypto.randomBytes(12).toString('hex')}`;
    const meta = JSON.stringify(existingId ? { name } : { name, parents: [folderId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${DOCX_TYPE}\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const url = existingId
      ? `${DRIVE_UPLOAD}/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id,size`
      : `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,size`;
    const out = await this.json(url, { method: existingId ? 'PATCH' : 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body });
    return { id: out.id, size: Number(out.size) || buffer.length };
  }

  async verify(id) {
    const res = await this.call(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=id,size,trashed`);
    if (res.status === 404) return { exists: false, trashed: false, size: 0 };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Drive said: ${data?.error?.message || `HTTP ${res.status}`}`);
    return { exists: true, trashed: !!data.trashed, size: Number(data.size) || 0 };
  }

  async findFiles(folderId, name) {
    const out = await this.json(`${DRIVE_API}/files?${new URLSearchParams({
      q: `name='${q(name)}' and '${q(folderId)}' in parents and trashed=false`,
      fields: 'files(id,size,trashed)', spaces: 'drive', pageSize: '20',
    })}`);
    return (out.files || []).map((f) => ({ id: f.id, size: Number(f.size) || 0, trashed: !!f.trashed }));
  }

  async trash(id) {
    await this.json(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=id`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }),
    });
  }
}

module.exports = { LocalStore, DriveStore, googleTokenSource, encryptSecret, decryptSecret, safeName, fatal, DOCX_TYPE, GOOGLE_TOKEN_URL };
