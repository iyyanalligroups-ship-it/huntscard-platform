import { useEffect, useRef, useState } from 'react';
import { LifeBuoy, Plus, RefreshCw, Send, ArrowLeft, X } from 'lucide-react';
import { api } from '../api.js';
import ThemedSelect from '../components/ThemedSelect.jsx';

const CATEGORIES = [
  { value: 'order', label: 'An order (placing, shipping, delivery)' },
  { value: 'card', label: 'My card (not working, damaged, lost)' },
  { value: 'payment', label: 'Payment or invoice' },
  { value: 'account', label: 'My account or profile' },
  { value: 'other', label: 'Something else' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label.split(' (')[0]]));
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const SUBJECT_MAX = 120;
const DESC_MIN = 10;
const DESC_MAX = 2000;

// Enter sends the message; Shift+Enter adds a new line. (Ignored while an input method is composing text.)
function sendOnEnter(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

function when(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SupportTickets() {
  const [tickets, setTickets] = useState(null); // null while loading
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [openTicket, setOpenTicket] = useState(null); // full ticket (with messages) being viewed
  const [refreshing, setRefreshing] = useState(false);

  // Form
  const [category, setCategory] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState(null); // { fullName, loginEmail } -- shown on the From line
  const [orders, setOrders] = useState([]); // { value, label }
  const [cards, setCards] = useState([]);

  // Reply
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const threadEnd = useRef(null);

  function showToast(text, kind = 'success') {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 5000 : 3000);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (error) showToast(error, 'error');
  }, [error]);

  function loadTickets({ refresh = false } = {}) {
    if (refresh) setRefreshing(true);
    setError('');
    return api
      .listMyTickets()
      .then(setTickets)
      .catch((err) => setError(err.message))
      .finally(() => setRefreshing(false));
  }

  useEffect(() => {
    loadTickets();
    api.getProfile().then((p) => setMe({ fullName: p.fullName, loginEmail: p.loginEmail })).catch(() => {});
    // Options for "what is it about" -- only this client's own paid orders and cards.
    Promise.all([api.listMyRequests().catch(() => []), api.listMyMagicPosterOrders({ limit: 50 }).catch(() => ({ orders: [] })), api.getMyCards().catch(() => [])]).then(
      ([requests, posters, myCards]) => {
        const cardOrders = requests.filter((r) => r.type === 'upgrade' && r.paymentStatus === 'paid' && r.orderNumber);
        const posterOrders = (posters.orders || []).filter((o) => o.orderNumber);
        setOrders([
          ...cardOrders.map((r) => ({ value: r.orderNumber, label: `${r.orderNumber} · Card order` })),
          ...posterOrders.map((o) => ({ value: o.orderNumber, label: `${o.orderNumber} · Magic Poster order` })),
        ]);
        setCards(myCards.map((c) => ({ value: String(c.cardNumber), label: `Card #${c.cardNumber}${c.variantName ? ` · ${c.variantName}` : c.planName || c.cardType ? ` · ${c.planName || c.cardType}` : ''}` })));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [openTicket?.messages?.length]);

  function resetForm() {
    setCategory('');
    setOrderNumber('');
    setCardNumber('');
    setSubject('');
    setDescription('');
    setFormError('');
  }

  async function submitTicket(e) {
    e.preventDefault();
    setFormError('');
    if (!category) return setFormError('Choose what the ticket is about.');
    if (subject.trim().length < 5) return setFormError('Add a short subject (at least 5 characters).');
    if (description.trim().length < DESC_MIN) return setFormError(`Describe the problem in at least ${DESC_MIN} characters.`);
    setSaving(true);
    try {
      const t = await api.createTicket({
        category,
        subject: subject.trim(),
        description: description.trim(),
        orderNumber: orderNumber || undefined,
        cardNumber: cardNumber || undefined,
      });
      showToast(`Sent. Your ticket number is ${t.ticketNumber}. We'll reply by email and here.`);
      resetForm();
      setShowForm(false);
      await loadTickets();
      setOpenTicket(t);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openDetails(id) {
    setError('');
    try {
      setOpenTicket(await api.getMyTicket(id));
      setTickets((list) => (list || []).map((t) => (t._id === id ? { ...t, clientUnread: false } : t)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshOpen() {
    if (!openTicket) return;
    setRefreshing(true);
    try {
      setOpenTicket(await api.getMyTicket(openTicket._id));
      await loadTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function sendReply(e) {
    e.preventDefault();
    const text = reply.trim();
    if (!text) return;
    setReplying(true);
    try {
      setOpenTicket(await api.replyToTicket(openTicket._id, text));
      setReply('');
      loadTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setReplying(false);
    }
  }

  const toastEl = toast && (
    <div className={`profile-toast profile-toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span>{toast.text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
    </div>
  );

  // ---------- one ticket ----------
  if (openTicket) {
    const t = openTicket;
    return (
      <div className="tickets-page">
        <button type="button" className="secondary tickets-back" onClick={() => { setOpenTicket(null); loadTickets(); }}>
          <ArrowLeft size={14} aria-hidden="true" /> All tickets
        </button>
        <div className="card tickets-detail">
          <div className="tickets-detail-head">
            <div>
              <span className="tickets-number">{t.ticketNumber}</span>
              <h2>{t.subject}</h2>
              <p className="hint" style={{ margin: 0 }}>
                {CATEGORY_LABEL[t.category]}
                {t.orderNumber ? ` · Order ${t.orderNumber}` : ''}
                {t.cardNumber ? ` · Card #${t.cardNumber}` : ''} · Raised {when(t.createdAt)}
              </p>
            </div>
            <span className={`tickets-status tickets-status--${t.status}`}>{STATUS_LABEL[t.status]}</span>
          </div>

          <div className="tickets-thread tickets-mails" aria-live="polite">
            {t.messages.map((m, i) => (
              <article key={m._id} className={`tickets-mail tickets-mail--${m.from}`}>
                <dl className="tickets-mail-head">
                  <div><dt>From</dt><dd>{m.from === 'admin' ? 'Support team' : 'You'}</dd></div>
                  <div><dt>To</dt><dd>{m.from === 'admin' ? 'You' : 'Support team'}</dd></div>
                  <div><dt>Date</dt><dd>{when(m.at)}</dd></div>
                  <div><dt>Subject</dt><dd>{i === 0 ? t.subject : `Re: ${t.subject}`}</dd></div>
                </dl>
                <div className="tickets-mail-body">{m.text}</div>
              </article>
            ))}
            <div ref={threadEnd} />
          </div>

          {t.status === 'resolved' && <p className="hint">This ticket is resolved. Send a message below if you need to reopen it.</p>}
          <form className="tickets-reply" onSubmit={sendReply}>
            <textarea
              onKeyDown={sendOnEnter}
              rows={3}
              value={reply}
              maxLength={DESC_MAX}
              placeholder={t.status === 'resolved' ? 'Write a message to reopen this ticket…' : 'Write a reply…'}
              onChange={(e) => setReply(e.target.value)}
              aria-label="Your reply"
            />
            <div className="tickets-reply-actions">
              <button type="button" className="secondary" onClick={refreshOpen} disabled={refreshing}>
                <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'track-refresh-spin' : undefined} /> Refresh
              </button>
              <button type="submit" disabled={replying || !reply.trim()}>
                <Send size={14} aria-hidden="true" /> {replying ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </div>
        {toastEl}
      </div>
    );
  }

  // ---------- list + new ticket ----------
  return (
    <div className="tickets-page">
      <div className="tickets-heading">
        <span className="tickets-heading-icon"><LifeBuoy size={22} /></span>
        <div>
          <h1>Raise a ticket</h1>
          <p className="subtitle" style={{ margin: 0 }}>Write to us about a problem with an order, your card, a payment or your account. We email you back, and the replies also appear here.</p>
        </div>
        <div className="tickets-heading-actions">
          <button type="button" className="secondary" onClick={() => loadTickets({ refresh: true })} disabled={refreshing}>
            <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'track-refresh-spin' : undefined} /> Refresh
          </button>
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <><X size={14} aria-hidden="true" /> Close</> : <><Plus size={14} aria-hidden="true" /> New message</>}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="card tickets-form tickets-compose" onSubmit={submitTicket} noValidate>
          <div className="tickets-compose-title">New message to Support</div>
          {formError && <div className="error-banner">{formError}</div>}
          <div className="tickets-compose-row">
            <span>From</span>
            <strong>{me ? `${me.fullName || 'You'}${me.loginEmail ? ` <${me.loginEmail}>` : ''}` : 'You'}</strong>
          </div>
          <div className="tickets-compose-row">
            <span>To</span>
            <strong>Support team</strong>
          </div>
          {me && !me.loginEmail && (
            <p className="hint" style={{ margin: 0 }}>There is no email address on your account, so we cannot email you. Replies will still appear in this ticket.</p>
          )}
          <div className="tickets-compose-row tickets-compose-field">
            <label htmlFor="tkCategory">About</label>
            <ThemedSelect id="tkCategory" value={category} onChange={setCategory} ariaLabel="What is the ticket about" options={[{ value: '', label: 'Choose one…' }, ...CATEGORIES]} />
          </div>
          <div className="tickets-compose-row tickets-compose-field">
            <label htmlFor="tkOrder">Order</label>
            <ThemedSelect id="tkOrder" value={orderNumber} onChange={setOrderNumber} ariaLabel="Related order (optional)" options={[{ value: '', label: 'Not about a specific order (optional)' }, ...orders]} />
          </div>
          <div className="tickets-compose-row tickets-compose-field">
            <label htmlFor="tkCard">Card</label>
            <ThemedSelect id="tkCard" value={cardNumber} onChange={setCardNumber} ariaLabel="Related card (optional)" options={[{ value: '', label: 'Not about a specific card (optional)' }, ...cards]} />
          </div>
          <div className="tickets-compose-row tickets-compose-field">
            <label htmlFor="tkSubject">Subject</label>
            <input id="tkSubject" value={subject} maxLength={SUBJECT_MAX} placeholder="e.g. My card does not open my profile" onChange={(e) => setSubject(e.target.value)} />
          </div>
          <textarea id="tkDesc" className="tickets-compose-body" rows={8} value={description} maxLength={DESC_MAX} placeholder="Write your message. Tell us what you expected and what happened instead." onChange={(e) => setDescription(e.target.value)} aria-label="Message" onKeyDown={sendOnEnter} />
          <div className="tickets-form-actions">
            <span className="bio-character-count">{description.length} / {DESC_MAX} · Enter to send, Shift+Enter for a new line</span>
            <button type="button" className="secondary" onClick={() => { resetForm(); setShowForm(false); }}>Discard</button>
            <button type="submit" disabled={saving}><Send size={14} aria-hidden="true" /> {saving ? 'Sending…' : 'Send'}</button>
          </div>
        </form>
      )}

      {tickets === null ? (
        <p className="subtitle">Loading…</p>
      ) : tickets.length === 0 ? (
        <div className="card tickets-empty">
          <LifeBuoy size={28} aria-hidden="true" />
          <h3>No tickets yet</h3>
          <p>If something is wrong, raise a ticket and we will reply here.</p>
          {!showForm && <button type="button" onClick={() => setShowForm(true)}><Plus size={14} aria-hidden="true" /> New ticket</button>}
        </div>
      ) : (
        <div className="tickets-list">
          {tickets.map((t) => (
            <button type="button" key={t._id} className="card tickets-row" onClick={() => openDetails(t._id)}>
              <div className="tickets-row-main">
                <span className="tickets-number">{t.ticketNumber}{t.clientUnread && <i className="tickets-dot" title="New reply" />}</span>
                <strong>{t.subject}</strong>
                <small>
                  {CATEGORY_LABEL[t.category]}
                  {t.orderNumber ? ` · ${t.orderNumber}` : ''}
                  {t.cardNumber ? ` · Card #${t.cardNumber}` : ''} · Updated {when(t.lastActivityAt)}
                </small>
              </div>
              <span className={`tickets-status tickets-status--${t.status}`}>{STATUS_LABEL[t.status]}</span>
            </button>
          ))}
        </div>
      )}
      {toastEl}
    </div>
  );
}
