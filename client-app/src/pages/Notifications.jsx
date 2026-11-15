import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../api.js';

const PAGE = 20;

function timeAgo(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Every notification, newest first, with mark-read and delete. (The bell in the top bar shows only the unread ones.)
export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null); // null while loading
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  function say(text) {
    setToast(text);
    window.setTimeout(() => setToast(''), 2500);
  }

  async function load() {
    setError('');
    try {
      const r = await api.getNotifications({ limit: PAGE, skip: 0 });
      setItems(r.notifications);
      setTotal(r.total);
      setUnread(r.unreadCount);
      setHasMore(r.hasMore);
    } catch (err) {
      setError(err.message);
      setItems((cur) => cur || []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const r = await api.getNotifications({ limit: PAGE, skip: items.length });
      setItems((cur) => {
        const have = new Set(cur.map((n) => n._id));
        return [...cur, ...r.notifications.filter((n) => !have.has(n._id))];
      });
      setTotal(r.total);
      setHasMore(r.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(n) {
    if (n.read) return;
    setItems((cur) => cur.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await api.markNotificationRead(n._id);
    } catch {
      load();
    }
  }

  async function open(n) {
    await markRead(n);
    if (n.link) navigate(n.link);
  }

  async function remove(n) {
    setError('');
    try {
      await api.deleteNotification(n._id);
      setItems((cur) => cur.filter((x) => x._id !== n._id));
      setTotal((t) => Math.max(0, t - 1));
      if (!n.read) setUnread((u) => Math.max(0, u - 1));
      say('Notification deleted.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function markAll() {
    setError('');
    try {
      await api.markAllNotificationsRead();
      setItems((cur) => cur.map((n) => ({ ...n, read: true })));
      setUnread(0);
      say('All notifications marked as read.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function clear(scope) {
    const label = scope === 'all' ? 'all your notifications' : 'all the notifications you have already read';
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setError('');
    try {
      const r = await api.clearNotifications(scope);
      say(`${r.deleted} notification${r.deleted === 1 ? '' : 's'} deleted.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="notif-page">
      <div className="notif-head">
        <span className="notif-head-icon"><Bell size={22} /></span>
        <div>
          <h1>Notifications</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            {items === null ? 'Loading…' : `${total} in total${unread ? ` · ${unread} unread` : ' · all read'}`}
          </p>
        </div>
        <div className="notif-head-actions">
          <button type="button" className="secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
          <button type="button" className="secondary" onClick={markAll} disabled={!unread}><CheckCheck size={14} /> Mark all read</button>
          <button type="button" className="secondary" onClick={() => clear('read')} disabled={total - unread === 0}><Trash2 size={14} /> Delete read</button>
          <button type="button" className="secondary notif-danger" onClick={() => clear('all')} disabled={total === 0}><Trash2 size={14} /> Delete all</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {items && items.length === 0 ? (
        <div className="card notif-empty">
          <Bell size={28} />
          <h3>No notifications</h3>
          <p>When someone shares their contact with you, or support replies to a ticket, it shows up here.</p>
        </div>
      ) : (
        <div className="notif-list">
          {(items || []).map((n) => (
            <div key={n._id} className={`card notif-row${n.read ? '' : ' is-unread'}`}>
              <button type="button" className="notif-main" onClick={() => open(n)} title={n.link ? 'Open' : undefined}>
                {!n.read && <i className="notif-dot" aria-label="Unread" />}
                <span className="notif-text">{n.message}</span>
                <small>{timeAgo(n.createdAt)}{n.link ? ' · tap to open' : ''}</small>
              </button>
              <div className="notif-actions">
                {!n.read && <button type="button" className="secondary" onClick={() => markRead(n)}>Mark read</button>}
                <button type="button" className="secondary notif-danger" onClick={() => remove(n)} aria-label="Delete notification"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {hasMore && (
            <button type="button" className="secondary notif-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : `Load more (${total - items.length} left)`}
            </button>
          )}
        </div>
      )}
      {toast && <div className="profile-toast profile-toast--success" role="status"><span>{toast}</span></div>}
    </div>
  );
}
