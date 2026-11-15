import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { Button, Card, Empty, Field, Loading, Message, Pill, Screen, SelectField, Title } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';
import { colors } from '../theme/colors.js';

// "Raise a ticket", email style (same as the website): a list of tickets, a compose form that reads like a new
// mail to Support, and a thread of mails with a reply box. Replies from Support also arrive by email.
const CATEGORIES = [
  { value: 'order', label: 'An order (placing, shipping, delivery)' },
  { value: 'card', label: 'My card (not working, damaged, lost)' },
  { value: 'payment', label: 'Payment or invoice' },
  { value: 'account', label: 'My account or profile' },
  { value: 'other', label: 'Something else' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label.split(' (')[0]]));
const STATUS = { open: ['Open', 'cyan'], in_progress: ['In progress', 'warning'], resolved: ['Resolved', 'dim'] };
const SUBJECT_MAX = 120;
const DESC_MIN = 10;
const DESC_MAX = 2000;
const POLL_MS = 15000; // new replies show up without a manual refresh

const when = (v) => (v ? formatDateTime(v, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function SupportTicketsScreen() {
  const [tickets, setTickets] = useState(null);
  const [open, setOpen] = useState(null); // full ticket being read
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [me, setMe] = useState(null);
  const [orders, setOrders] = useState([]);
  const [cards, setCards] = useState([]);
  const [category, setCategory] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const openRef = useRef(null);
  openRef.current = open;

  const loadTickets = useCallback(async () => {
    try { setTickets(await api.listMyTickets()); setError(''); }
    catch (err) { setError(err.message); setTickets((cur) => cur || []); }
  }, []);

  useFocusEffect(useCallback(() => {
    loadTickets();
    const timer = setInterval(async () => {
      loadTickets();
      const current = openRef.current;
      if (current) { try { setOpen(await api.getMyTicket(current._id)); } catch { /* keep what is shown */ } }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadTickets]));

  useEffect(() => {
    api.getProfile().then((p) => setMe({ fullName: p.fullName, loginEmail: p.loginEmail })).catch(() => {});
    // Only this client's own paid orders and cards can be picked as "what it is about".
    Promise.all([api.listMyRequests().catch(() => []), api.listMyMagicPosterOrders().catch(() => ({ orders: [] })), api.getMyCards().catch(() => [])]).then(([requests, posters, myCards]) => {
      const cardOrders = (requests || []).filter((r) => r.type === 'upgrade' && r.paymentStatus === 'paid' && r.orderNumber);
      const posterOrders = (posters.orders || []).filter((o) => o.orderNumber);
      setOrders([
        ...cardOrders.map((r) => ({ value: r.orderNumber, label: `${r.orderNumber} · Card order` })),
        ...posterOrders.map((o) => ({ value: o.orderNumber, label: `${o.orderNumber} · Magic Poster order` })),
      ]);
      setCards((myCards || []).map((c) => ({ value: String(c.cardNumber), label: `Card #${c.cardNumber}${c.variantName ? ` · ${c.variantName}` : c.planName || c.cardType ? ` · ${c.planName || c.cardType}` : ''}` })));
    });
  }, []);

  async function refresh() {
    setRefreshing(true);
    await loadTickets();
    if (open) { try { setOpen(await api.getMyTicket(open._id)); } catch (err) { setError(err.message); } }
    setRefreshing(false);
  }

  function resetForm() { setCategory(''); setOrderNumber(''); setCardNumber(''); setSubject(''); setDescription(''); setFormError(''); }

  async function submitTicket() {
    setFormError('');
    if (!category) return setFormError('Choose what the ticket is about.');
    if (subject.trim().length < 5) return setFormError('Add a short subject (at least 5 characters).');
    if (description.trim().length < DESC_MIN) return setFormError(`Describe the problem in at least ${DESC_MIN} characters.`);
    setSaving(true);
    try {
      const t = await api.createTicket({ category, subject: subject.trim(), description: description.trim(), orderNumber: orderNumber || undefined, cardNumber: cardNumber || undefined });
      setNotice(`Sent. Your ticket number is ${t.ticketNumber}. We'll reply by email and here.`);
      resetForm(); setComposing(false); setOpen(t); loadTickets();
    } catch (err) { setFormError(err.message); } finally { setSaving(false); }
  }

  async function openTicket(id) {
    setError(''); setNotice('');
    try {
      setOpen(await api.getMyTicket(id));
      setTickets((list) => (list || []).map((t) => (t._id === id ? { ...t, clientUnread: false } : t)));
    } catch (err) { setError(err.message); }
  }

  async function sendReply() {
    const text = reply.trim();
    if (!text) return;
    setReplying(true);
    try { setOpen(await api.replyToTicket(open._id, text)); setReply(''); loadTickets(); }
    catch (err) { setError(err.message); } finally { setReplying(false); }
  }

  // ---------- one ticket: a thread of mails ----------
  if (open) {
    const t = open;
    const [statusLabel, statusTone] = STATUS[t.status] || STATUS.open;
    return <Screen refreshing={refreshing} onRefresh={refresh}>
      <Button compact kind="secondary" icon="chevronLeft" title="All tickets" onPress={() => { setOpen(null); setReply(''); loadTickets(); }} style={{ alignSelf: 'flex-start' }} />
      <Message>{error}</Message><Message tone="success">{notice}</Message>
      <Card style={{ gap: 6 }}>
        <View style={styles.between}><Text style={styles.number}>{t.ticketNumber}</Text><Pill tone={statusTone}>{statusLabel}</Pill></View>
        <Text style={styles.subject}>{t.subject}</Text>
        <Text style={styles.meta}>{CATEGORY_LABEL[t.category]}{t.orderNumber ? ` · Order ${t.orderNumber}` : ''}{t.cardNumber ? ` · Card #${t.cardNumber}` : ''} · Raised {when(t.createdAt)}</Text>
      </Card>
      {t.messages.map((m, i) => {
        const fromSupport = m.from === 'admin';
        return <Card key={m._id || i} style={[styles.mail, fromSupport && styles.mailSupport]}>
          <Text style={styles.mailHead}><Text style={styles.mailKey}>From </Text>{fromSupport ? 'Support team' : 'You'}</Text>
          <Text style={styles.mailHead}><Text style={styles.mailKey}>To </Text>{fromSupport ? 'You' : 'Support team'}</Text>
          <Text style={styles.mailHead}><Text style={styles.mailKey}>Date </Text>{when(m.at)}</Text>
          <Text style={styles.mailHead}><Text style={styles.mailKey}>Subject </Text>{i === 0 ? t.subject : `Re: ${t.subject}`}</Text>
          <View style={styles.rule} />
          <Text style={styles.mailBody}>{m.text}</Text>
        </Card>;
      })}
      {t.status === 'resolved' ? <Text style={styles.meta}>This ticket is resolved. Send a message below if you need to reopen it.</Text> : null}
      <Field label="Reply" multiline maxLength={DESC_MAX} placeholder={t.status === 'resolved' ? 'Write a message to reopen this ticket…' : 'Write a reply…'} value={reply} onChangeText={setReply} />
      <Button icon="send" title={replying ? 'Sending…' : 'Send'} disabled={replying || !reply.trim()} onPress={sendReply} />
    </Screen>;
  }

  // ---------- list + compose ----------
  return <Screen refreshing={refreshing} onRefresh={refresh}>
    <Title subtitle="Write to us about a problem with an order, your card, a payment or your account. We email you back, and the replies also appear here.">Raise a ticket</Title>
    <Message>{error}</Message><Message tone="success">{notice}</Message>
    <Button icon={composing ? 'close' : 'plus'} kind={composing ? 'secondary' : 'primary'} title={composing ? 'Close' : 'New message'} onPress={() => setComposing((v) => !v)} />

    {composing ? <Card style={{ gap: 12 }}>
      <Text style={styles.composeTitle}>New message to Support</Text>
      <Message>{formError}</Message>
      <Text style={styles.meta}>From  {me ? `${me.fullName || 'You'}${me.loginEmail ? ` <${me.loginEmail}>` : ''}` : 'You'}{'\n'}To  Support team</Text>
      {me && !me.loginEmail ? <Text style={styles.meta}>There is no email address on your account, so we cannot email you. Replies will still appear in this ticket.</Text> : null}
      <SelectField label="About" value={category} options={CATEGORIES} onChange={setCategory} placeholder="Choose one…" />
      <SelectField label="Order (optional)" value={orderNumber} options={[{ value: '', label: 'Not about a specific order' }, ...orders]} onChange={setOrderNumber} placeholder="Not about a specific order" />
      <SelectField label="Card (optional)" value={cardNumber} options={[{ value: '', label: 'Not about a specific card' }, ...cards]} onChange={setCardNumber} placeholder="Not about a specific card" />
      <Field label="Subject" maxLength={SUBJECT_MAX} placeholder="e.g. My card does not open my profile" value={subject} onChangeText={setSubject} />
      <Field label="Message" multiline maxLength={DESC_MAX} placeholder="Tell us what you expected and what happened instead." value={description} onChangeText={setDescription} hint={`${description.length} / ${DESC_MAX}`} />
      <View style={styles.row}>
        <Button kind="secondary" title="Discard" onPress={() => { resetForm(); setComposing(false); }} style={{ flex: 1 }} />
        <Button icon="send" title={saving ? 'Sending…' : 'Send'} disabled={saving} onPress={submitTicket} style={{ flex: 1 }} />
      </View>
    </Card> : null}

    {tickets === null ? <Loading /> : !tickets.length ? <Empty>No tickets yet. If something is wrong, raise a ticket and we will reply here.</Empty> : tickets.map((t) => {
      const [label, tone] = STATUS[t.status] || STATUS.open;
      return <Pressable key={t._id} onPress={() => openTicket(t._id)}>
        <Card style={styles.row2}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.between}><Text style={styles.number}>{t.ticketNumber}{t.clientUnread ? '  ●' : ''}</Text><Pill tone={tone}>{label}</Pill></View>
            <Text style={styles.subject} numberOfLines={2}>{t.subject}</Text>
            <Text style={styles.meta}>{CATEGORY_LABEL[t.category]}{t.orderNumber ? ` · ${t.orderNumber}` : ''}{t.cardNumber ? ` · Card #${t.cardNumber}` : ''} · Updated {when(t.lastActivityAt)}</Text>
          </View>
        </Card>
      </Pressable>;
    })}
  </Screen>;
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { color: colors.holoCyan, fontWeight: '800', fontSize: 12, letterSpacing: 0.4 },
  subject: { color: colors.text, fontWeight: '800', fontSize: 15, lineHeight: 20 },
  meta: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  composeTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  mail: { gap: 2 },
  mailSupport: { borderColor: colors.holoCyan },
  mailHead: { color: colors.text, fontSize: 12.5, lineHeight: 18 },
  mailKey: { color: colors.textDim, fontWeight: '700' },
  rule: { height: 1, backgroundColor: colors.panelBorder, marginVertical: 8 },
  mailBody: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
