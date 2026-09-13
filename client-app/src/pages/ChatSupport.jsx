import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isLoggedIn } from '../api.js';

const POLL_MS = 5000;

// Real two-way conversation with admin -- distinct from the Contact Us
// form (which is one-way, no reply comes back anywhere). Needs a login
// so there's someone for admin's reply to go to; a logged-out visitor
// gets a prompt instead of the chat itself. No websockets in this stack,
// so "live" here means polling every few seconds while the tab is open,
// same trade-off the rest of this app makes elsewhere (e.g. no push
// infra for Contact Us either).
export default function ChatSupport() {
  const loggedIn = isLoggedIn();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  async function load() {
    try {
      const msgs = await api.getChat();
      setMessages(msgs);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loggedIn) return;
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    try {
      const sent = await api.sendChatMessage(trimmed);
      setMessages((prev) => [...prev, sent]);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!loggedIn) {
    return (
      <div>
        <Link to="/dashboard" className="back-link">‹ Back to Dashboard</Link>
        <h1 className="section-heading" style={{ marginTop: 0 }}>Chat Support</h1>
        <p className="section-subheading">Message our team directly and get a reply here.</p>
        <div className="checkout-panel" style={{ maxWidth: 440 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 14px' }}>Log in to start a conversation with support.</p>
            <Link to="/login"><button type="button">Log in</button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link to="/dashboard" className="back-link">‹ Back to Dashboard</Link>
      <h1 className="section-heading" style={{ marginTop: 0 }}>Chat Support</h1>
      <p className="section-subheading">Message our team directly and get a reply here.</p>

      <div className="checkout-panel chat-panel">
        <div className="card chat-card">
          {error && <div className="error-banner">{error}</div>}
          <div className="chat-messages" ref={listRef}>
            {loading ? (
              <p className="hint">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="hint" style={{ textAlign: 'center' }}>
                No messages yet — say hello, our team usually replies soon.
              </p>
            ) : (
              messages.map((m) => (
                <div key={m._id} className={`chat-bubble-row${m.sender === 'client' ? ' mine' : ''}`}>
                  <div className={`chat-bubble${m.sender === 'client' ? ' mine' : ''}`}>
                    {m.text}
                    <span className="chat-bubble-time">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              maxLength={4000}
            />
            <button type="submit" disabled={sending || !text.trim()} style={{ width: 'auto' }}>
              {sending ? '…' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
