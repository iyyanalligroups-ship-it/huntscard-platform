// Builds one person's day as a small Word (.docx) file, by hand: just [Content_Types].xml, _rels/.rels
// and word/document.xml in a zip. No theme, styles or footnotes, so it is about 2 KB instead of 11-16 KB.
// The zip parts are already deflated; zipping the .docx again would save only ~7%, so it is not done.
// The output is byte-for-byte the same for the same input (fixed zip dates), so it can be compared.
const { ZipArchive } = require('archiver'); // archiver v8 exports classes, not a factory function
const { OFFSET_MS } = require('./istTime');

const FIXED_DATE = new Date('2000-01-01T00:00:00Z');

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '</Types>';

const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '</Relationships>';

// XML 1.0 cannot hold most control characters or lone surrogates; text from users could.
function clean(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// run = [text, { bold, size (half-points), color (hex), strike }]
function run(text, o = {}) {
  const props = `${o.bold ? '<w:b/>' : ''}${o.strike ? '<w:strike/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.size ? `<w:sz w:val="${o.size}"/>` : ''}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${clean(text)}</w:t></w:r>`;
}
const para = (runs, indent) => `<w:p>${indent ? `<w:pPr><w:ind w:left="${indent}"/></w:pPr>` : ''}${runs.join('')}</w:p>`;
const blank = () => '<w:p/>';

const hms = (d) => new Date(new Date(d).getTime() + OFFSET_MS).toISOString().slice(11, 19); // India time, 24 h
const endWord = (s) => (s.endedAt ? (s.endReason === 'switched' ? 'switched account' : 'logged out') : 'no logout recorded');
const where = (p) => (p === 'app' ? 'App' : 'Website');

// sessions: ActivitySession documents (plain objects) of one person on one India day, oldest first.
function documentXml({ person, day, sessions }) {
  const things = sessions.reduce((n, s) => n + Math.max(0, (s.eventCount || 0) - 1 - (s.endedAt ? 1 : 0)), 0);
  const body = [];
  body.push(para([run(`Activity log - ${person.name} (${person.id})`, { bold: true, size: 32 })]));
  body.push(para([run(`Day: ${day} (India time) - ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}, ${things} ${things === 1 ? 'thing' : 'things'} done`)]));
  sessions.forEach((s, i) => {
    body.push(blank());
    body.push(para([run(`Session ${i + 1}: ${hms(s.startedAt)} to ${hms(s.endedAt || s.lastActivityAt)} - ${where(s.platform)} - ${endWord(s)}`, { bold: true })]));
    for (const e of s.events || []) {
      body.push(para([run(`${hms(e.at)}  `, { color: '666666' }), run(e.label)], 360));
      for (const c of e.changes || []) {
        body.push(para([run(`${c.label}: `, { bold: true }), run(c.before || '(empty)', { color: 'C00000', strike: true }), run('  ->  '), run(c.after || '(empty)', { color: '1E7B34' })], 720));
      }
    }
    if ((s.eventCount || 0) > (s.events || []).length) {
      body.push(para([run(`Only the latest ${(s.events || []).length} of ${s.eventCount} steps were kept.`, { color: '666666' })], 360));
    }
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + body.join('')
    + '</w:body></w:document>';
}

// -> Promise<Buffer>
function buildDocx(input) {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks = [];
    archive.on('data', (c) => chunks.push(c));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    // [Content_Types].xml first, as Word expects
    archive.append(CONTENT_TYPES, { name: '[Content_Types].xml', date: FIXED_DATE });
    archive.append(RELS, { name: '_rels/.rels', date: FIXED_DATE });
    archive.append(documentXml(input), { name: 'word/document.xml', date: FIXED_DATE });
    archive.finalize();
  });
}

module.exports = { buildDocx, documentXml, clean };
