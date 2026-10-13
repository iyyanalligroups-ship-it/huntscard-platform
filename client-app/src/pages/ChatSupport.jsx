import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isLoggedIn } from '../api.js';
import { IlloChat } from '../components/Illustrations.jsx';
import { ChevronDown, Copy, CornerUpLeft, Pencil, Trash2, Ban, X } from 'lucide-react';

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
  const inputRef = useRef(null);
  const [menuFor, setMenuFor] = useState(null); // message id whose action menu is open
  const [menuStage, setMenuStage] = useState('main'); // 'main' | 'delete' (the "for me / for everyone" choice)
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');
  const stickToBottomRef = useRef(true); // only auto-scroll when the user is already at the bottom

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
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleScroll(e) {
    const el = e.currentTarget;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // Close the action menu on outside click / Escape.
  useEffect(() => {
    if (!menuFor) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !e.target.closest('.cm-menu, .cm-menu-btn')) setMenuFor(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuFor]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1600);
  }

  function cancelComposerMode() {
    setEditing(null);
    setReplyingTo(null);
    setText('');
  }

  function startReply(m) {
    setMenuFor(null);
    if (editing) setText('');
    setEditing(null);
    setReplyingTo(m);
    inputRef.current?.focus();
  }

  function startEdit(m) {
    setMenuFor(null);
    setReplyingTo(null);
    setEditing(m);
    setText(m.text);
    inputRef.current?.focus();
  }

  async function copyMessage(m) {
    setMenuFor(null);
    try {
      await navigator.clipboard.writeText(m.text);
    } catch {
      // Clipboard API needs a secure context -- fall back to a temporary textarea.
      const ta = document.createElement('textarea');
      ta.value = m.text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast('Message copied');
  }

  function toggleMenu(id) {
    setMenuStage('main');
    setMenuFor((current) => (current === id ? null : id));
  }

  // mode: 'me' hides it from this chat only; 'everyone' leaves "This message was deleted" for both sides.
  async function deleteMessage(m, mode) {
    setMenuFor(null);
    try {
      const result = await api.deleteChatMessage(m._id, mode);
      setMessages((prev) =>
        result.hidden ? prev.filter((x) => x._id !== m._id) : prev.map((x) => (x._id === result._id ? result : x))
      );
      if (editing?._id === m._id || replyingTo?._id === m._id) cancelComposerMode();
    } catch (err) {
      setError(err.message);
    }
  }

  // Jump to a quoted message.
  function scrollToMessage(id) {
    const el = listRef.current?.querySelector(`[data-msg-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('cm-flash');
    setTimeout(() => el.classList.remove('cm-flash'), 1400);
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    try {
      if (editing) {
        if (trimmed !== editing.text) {
          const updated = await api.editChatMessage(editing._id, trimmed);
          setMessages((prev) => prev.map((m) => (m._id === updated._id ? updated : m)));
        }
        cancelComposerMode();
        return;
      }
      const sent = await api.sendChatMessage(trimmed, replyingTo?._id);
      stickToBottomRef.current = true;
      setMessages((prev) => [...prev, sent]);
      setText('');
      setReplyingTo(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="au-page au-chat">
        <div className="au-chat-intro">
          <Link to="/dashboard" className="back-link">‹ Back to Dashboard</Link>
          <h1 className="section-heading">Chat Support</h1>
          <p className="section-subheading">Message our team directly and get a reply here.</p>
          <div className="av-side-art"><IlloChat /></div>
        </div>
        <div className="checkout-panel au-chat-panel au-chat-gate">
          <div className="card">
            <p>Log in to start a conversation with support.</p>
            <Link to="/login"><button type="button">Log in</button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="au-page au-chat">
      <div className="au-chat-intro">
        <Link to="/dashboard" className="back-link">‹ Back to Dashboard</Link>
        <h1 className="section-heading">Chat Support</h1>
        <p className="section-subheading">Message our team directly and get a reply here.</p>
          <div className="av-side-art"><IlloChat /></div>
      </div>

      <div className="checkout-panel chat-panel au-chat-panel">
        <div className="card chat-card">
          {error && <div className="error-banner">{error}</div>}
          <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
            {loading ? (
              <p className="hint">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="hint" style={{ textAlign: 'center' }}>
                No messages yet — say hello, our team usually replies soon.
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.sender === 'client';
                const quote = m.replyTo?.messageId ? m.replyTo : null;
                return (
                  <div key={m._id} data-msg-id={m._id} className={`chat-bubble-row${mine ? ' mine' : ''}`}>
                    <div className={`chat-bubble cm-bubble${mine ? ' mine' : ''}${m.deleted ? ' is-deleted' : ''}`}>
                      {quote && (
                        <button type="button" className="cm-quote" onClick={() => scrollToMessage(quote.messageId)}>
                          <strong>{quote.sender === 'client' ? 'You' : 'Support'}</strong>
                          <span>{quote.deleted ? 'This message was deleted' : quote.text}</span>
                        </button>
                      )}
                      {m.deleted ? (
                        <span className="cm-deleted"><Ban size={13} /> This message was deleted</span>
                      ) : (
                        m.text
                      )}
                      <span className="chat-bubble-time">
                        {m.editedAt && !m.deleted ? 'edited · ' : ''}
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {!m.deleted && (
                        <button
                          type="button"
                          className="cm-menu-btn"
                          aria-label="Message options"
                          onClick={() => toggleMenu(m._id)}
                        >
                          <ChevronDown size={15} />
                        </button>
                      )}
                      {menuFor === m._id && (
                        <div className={`cm-menu${mine ? ' align-right' : ''}`} role="menu">
                          {menuStage === 'delete' ? (
                            <>
                              <div className="cm-menu-title">Delete message?</div>
                              <button type="button" role="menuitem" className="cm-menu-item" onClick={() => deleteMessage(m, 'me')}><Trash2 size={14} /> Delete for me</button>
                              {mine && (
                                <button type="button" role="menuitem" className="cm-menu-item danger" onClick={() => deleteMessage(m, 'everyone')}><Trash2 size={14} /> Delete for everyone</button>
                              )}
                              <button type="button" role="menuitem" className="cm-menu-item" onClick={() => setMenuStage('main')}><X size={14} /> Cancel</button>
                            </>
                          ) : (
                            <>
                              <button type="button" role="menuitem" className="cm-menu-item" onClick={() => startReply(m)}><CornerUpLeft size={14} /> Reply</button>
                              <button type="button" role="menuitem" className="cm-menu-item" onClick={() => copyMessage(m)}><Copy size={14} /> Copy</button>
                              {mine && <button type="button" role="menuitem" className="cm-menu-item" onClick={() => startEdit(m)}><Pencil size={14} /> Edit</button>}
                              <button type="button" role="menuitem" className="cm-menu-item danger" onClick={() => setMenuStage('delete')}><Trash2 size={14} /> Delete</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {toast && <div className="cm-toast">{toast}</div>}
          {(replyingTo || editing) && (
            <div className="cm-banner">
              {editing ? <Pencil size={14} /> : <CornerUpLeft size={14} />}
              <div className="cm-banner-text">
                <strong>{editing ? 'Editing message' : `Replying to ${replyingTo.sender === 'client' ? 'yourself' : 'Support'}`}</strong>
                <span>{(editing || replyingTo).text}</span>
              </div>
              <button type="button" onClick={cancelComposerMode} aria-label="Cancel"><X size={14} /></button>
            </div>
          )}
          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={editing ? 'Edit your message…' : 'Type a message…'}
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
