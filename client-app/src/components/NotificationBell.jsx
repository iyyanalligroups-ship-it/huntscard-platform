import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';

// No WebSocket/real-time infra exists anywhere in this codebase (Socket.io
// only ever existed for the abandoned AR Call feature and was fully
// removed with it) -- polling is the pragmatic, pattern-consistent choice
// here rather than a new architectural direction.
const POLL_INTERVAL_MS = 30000;
// So the "Enable phone notifications" prompt doesn't nag on every single
// dashboard visit once the owner has already made a choice (granted,
// denied, or just dismissed it).
const PUSH_PROMPT_DISMISSED_KEY = 'huntstag-push-prompt-dismissed';

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// pushManager.subscribe's applicationServerKey needs a Uint8Array, but the
// VAPID public key travels as a base64url string -- the standard
// conversion, small enough not to need a package for it.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  // Viewport-relative position for the portaled panel(s) below, computed
  // from the bell button's own rect -- see the effect below for why this
  // is a portal at all, not a plain absolutely-positioned child.
  const [panelPos, setPanelPos] = useState(null);
  const bellBtnRef = useRef(null);
  const panelRef = useRef(null); // the portaled content -- outside-click detection needs this too, since it's no longer a DOM descendant of the button

  function loadNotifications() {
    api
      .getNotifications()
      .then((data) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Only offer the push opt-in when the browser actually supports it, the
  // owner hasn't already granted/denied it at the OS/browser level, and
  // they haven't dismissed this prompt before.
  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY)) return;
    setShowPushPrompt(true);
  }, []);

  // The dropdown/prompt are portaled straight to <body> (position: fixed,
  // computed from the bell button's own rect) instead of rendered as a
  // plain absolutely-positioned child -- this bell can be mounted inside
  // PublicLayout.jsx's top nav, which has `overflow: hidden` on its own
  // header (needed to contain decorative glow/circuit effects) and was
  // silently clipping any dropdown that tried to render below it. A
  // portal escapes that ancestor entirely, so this isn't tied to -- or at
  // risk of breaking -- that nav's own overflow/z-index setup.
  useEffect(() => {
    if (!open && !showPushPrompt) return;
    function updatePos() {
      if (!bellBtnRef.current) return;
      const rect = bellBtnRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 10, right: window.innerWidth - rect.right });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, showPushPrompt]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (bellBtnRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleMarkRead(id) {
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.markNotificationRead(id);
    } catch {
      loadNotifications(); // reconcile with the server if the optimistic update was wrong
    }
  }

  function dismissPushPrompt() {
    setShowPushPrompt(false);
    localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1');
  }

  async function handleEnablePush() {
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        dismissPushPrompt();
        return;
      }
      const { publicKey } = await api.getPushPublicKey();
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api.subscribePush(subscription.toJSON());
      dismissPushPrompt();
    } catch (err) {
      console.error('[push] enable failed:', err);
      dismissPushPrompt();
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <>
      <button
        ref={bellBtnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        style={{
          position: 'relative',
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid var(--panel-border)',
          background: 'var(--panel)',
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: '0 4px',
              borderRadius: 999,
              background: 'var(--danger, #e5484d)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {panelPos &&
        (showPushPrompt || open) &&
        createPortal(
          <div ref={panelRef}>
            {showPushPrompt && (
              <div
                style={{
                  position: 'fixed',
                  top: panelPos.top,
                  right: panelPos.right,
                  width: 260,
                  padding: 14,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--panel-border)',
                  background: 'var(--panel)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                  zIndex: 1000,
                }}
              >
                <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-dim)' }}>
                  Get notified on this phone when someone shares their contact with you.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={{ width: 'auto', fontSize: 12, padding: '6px 12px' }} onClick={handleEnablePush} disabled={pushBusy}>
                    {pushBusy ? 'Enabling…' : 'Enable'}
                  </button>
                  <button type="button" className="secondary" style={{ width: 'auto', fontSize: 12, padding: '6px 12px' }} onClick={dismissPushPrompt}>
                    Not now
                  </button>
                </div>
              </div>
            )}

            {open && (
              <div
                style={{
                  position: 'fixed',
                  top: showPushPrompt ? panelPos.top + 90 : panelPos.top,
                  right: panelPos.right,
                  width: 300,
                  maxHeight: 360,
                  overflowY: 'auto',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--panel-border)',
                  background: 'var(--panel)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                  zIndex: 1000,
                }}
              >
                <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--panel-border)' }}>Notifications</div>
                {notifications.length === 0 ? (
                  <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>No notifications yet.</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n._id}
                      onClick={() => !n.read && handleMarkRead(n._id)}
                      style={{
                        padding: '10px 14px',
                        cursor: n.read ? 'default' : 'pointer',
                        background: n.read ? 'transparent' : 'rgba(79, 142, 247, 0.1)',
                        borderBottom: '1px solid var(--panel-border)',
                      }}
                    >
                      <div style={{ fontSize: 13 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{timeAgo(n.createdAt)}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
