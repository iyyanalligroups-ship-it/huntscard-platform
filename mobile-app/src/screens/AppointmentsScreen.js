import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, resolveAssetUrl } from '../api/client.js';
import { Glyph } from '../components/Glyph.js';
import { Avatar, Button, Card, Empty, Loading, Message, Screen, Sheet, Title } from '../components/ui.js';
import { navigate } from '../navigation/navigationRef.js';
import { dateKey, formatDateTime, startOfWeek } from '../lib/format.js';
import { colors } from '../theme/colors.js';

const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined' };
const STATUS_COLOR = { pending: colors.holoCyan, accepted: '#22c58b', declined: colors.danger };
const QUICK_FILTERS = [{ key: 'all', label: 'All' }, { key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }];
const PAGE_SIZE = 5;
const INTERVAL_OPTIONS = [15, 30, 60];
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 18 * 60;
const SLOT_HEIGHT = 34;

function matchesQuickFilter(date, filter) {
  if (filter === 'all') return true;
  const now = new Date();
  if (filter === 'today') return dateKey(date) === dateKey(now);
  if (filter === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); return dateKey(date) === dateKey(y); }
  if (filter === 'week') { const ws = startOfWeek(now); const we = new Date(ws); we.setDate(we.getDate() + 7); return date >= ws && date < we; }
  if (filter === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  return true;
}

function timeLabel(minutes) {
  const h24 = Math.floor(minutes / 60); const m = minutes % 60;
  return `${h24 % 12 === 0 ? 12 : h24 % 12}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

function MiniMonth({ shown, onShown, selectedDay, onSelect, appointmentDays }) {
  const year = shown.getFullYear(); const month = shown.getMonth();
  const start = new Date(year, month, 1); start.setDate(start.getDate() - start.getDay());
  const todayKey = dateKey(new Date());
  const weeks = []; const cursor = new Date(start);
  for (let w = 0; w < 6; w++) { const row = []; for (let d = 0; d < 7; d++) { row.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); } weeks.push(row); }
  return <Card style={{ gap: 8, padding: 12 }}>
    <View style={styles.between}>
      <Text style={styles.strong}>{shown.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable style={styles.navBtn} onPress={() => onShown(new Date(year, month - 1, 1))}><Glyph name="chevronLeft" size={14} /></Pressable>
        <Pressable style={styles.navBtn} onPress={() => onShown(new Date(year, month + 1, 1))}><Glyph name="chevronRight" size={14} /></Pressable>
      </View>
    </View>
    <View style={styles.weekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={styles.weekday}>{d}</Text>)}</View>
    {weeks.map((row, wi) => <View key={wi} style={styles.weekRow}>
      {row.map((d) => {
        const key = dateKey(d); const selected = key === selectedDay; const inMonth = d.getMonth() === month;
        return <Pressable key={key} onPress={() => onSelect(d)} style={[styles.day, selected && styles.daySelected, key === todayKey && !selected && styles.dayToday, !inMonth && { opacity: 0.35 }]}>
          <Text style={[styles.dayText, selected && { color: '#06120f' }, key === todayKey && { fontWeight: '900' }]}>{d.getDate()}</Text>
          {appointmentDays.has(key) && !selected ? <View style={styles.apptDot} /> : null}
        </Pressable>;
      })}
    </View>)}
  </Card>;
}

function WeekGrid({ weekStart, onWeekChange, onToday, appointments, interval, onInterval, selectedDay, onSelectDay, onSelectAppointment }) {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  const weekKeys = new Set(days.map(dateKey)); const todayKey = dateKey(new Date());
  let startMin = DEFAULT_START; let endMin = DEFAULT_END;
  const inWeek = appointments.filter((a) => a.proposedAt && weekKeys.has(dateKey(new Date(a.proposedAt))));
  for (const a of inWeek) { const d = new Date(a.proposedAt); const mins = d.getHours() * 60 + d.getMinutes(); startMin = Math.min(startMin, Math.floor(mins / 60) * 60); endMin = Math.max(endMin, Math.ceil((mins + 1) / 60) * 60); }
  const bySlot = new Map();
  for (const a of inWeek) { const d = new Date(a.proposedAt); const mins = d.getHours() * 60 + d.getMinutes(); const slot = startMin + Math.floor((mins - startMin) / interval) * interval; const k = `${dateKey(d)}|${slot}`; if (!bySlot.has(k)) bySlot.set(k, []); bySlot.get(k).push(a); }
  const slots = []; for (let m = startMin; m < endMin; m += interval) slots.push(m);
  const COL = 74;
  return <Card style={{ gap: 12, padding: 12 }}>
    <View style={styles.between}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button compact kind="secondary" title="Today" onPress={onToday} />
        <Pressable style={styles.navBtn} onPress={() => onWeekChange(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7))}><Glyph name="chevronLeft" size={14} /></Pressable>
        <Pressable style={styles.navBtn} onPress={() => onWeekChange(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7))}><Glyph name="chevronRight" size={14} /></Pressable>
      </View>
      <View style={styles.intervals}>{INTERVAL_OPTIONS.map((m) => <Pressable key={m} onPress={() => onInterval(m)} style={[styles.interval, interval === m && styles.intervalOn]}><Text style={[styles.intervalText, interval === m && { color: '#06120f' }]}>{m}m</Text></Pressable>)}</View>
    </View>
    <Text style={styles.strong}>{days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={{ flexDirection: 'row', paddingLeft: 62 }}>
          {days.map((d) => { const key = dateKey(d); const selected = key === selectedDay; return <Pressable key={key} onPress={() => onSelectDay(selected ? null : key)} style={[styles.dayHead, { width: COL }, selected && { backgroundColor: colors.holoCyan }, key === todayKey && !selected && { borderBottomColor: colors.holoCyan }]}>
            <Text style={[styles.dayHeadSmall, selected && { color: '#06120f' }]}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text><Text style={[styles.dayHeadNum, selected && { color: '#06120f' }]}>{d.getDate()}</Text>
          </Pressable>; })}
        </View>
        <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
          {slots.map((slot) => <View key={slot} style={{ flexDirection: 'row', height: SLOT_HEIGHT, borderTopWidth: 1, borderTopColor: colors.panelBorder }}>
            <Text style={styles.slotLabel}>{timeLabel(slot)}</Text>
            {days.map((d) => <View key={dateKey(d)} style={{ width: COL, padding: 2, overflow: 'hidden' }}>
              {(bySlot.get(`${dateKey(d)}|${slot}`) || []).map((a) => <Pressable key={a._id} onPress={() => onSelectAppointment(a)} style={[styles.chip, { backgroundColor: STATUS_COLOR[a.status] }]}><Text style={[styles.chipText, a.status !== 'pending' && { color: '#fff' }]} numberOfLines={1}>{a.fromName || a.toName}</Text></Pressable>)}
            </View>)}
          </View>)}
        </ScrollView>
      </View>
    </ScrollView>
    {selectedDay ? <Button compact kind="secondary" title="Clear date filter" onPress={() => onSelectDay(null)} style={{ alignSelf: 'flex-start' }} /> : null}
  </Card>;
}

export default function AppointmentsScreen() {
  const [tab, setTab] = useState('received');
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [respondingId, setRespondingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [quickFilter, setQuickFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [interval, setIntervalMinutes] = useState(30);
  const [selectedDay, setSelectedDay] = useState(null);
  const [miniMonth, setMiniMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [previewId, setPreviewId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const load = useCallback(async () => {
    try { const [r, s] = await Promise.all([api.getReceivedAppointments(), api.getSentAppointments()]); setReceived(r); setSent(s); setError(''); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openPreview(clientId) {
    setPreviewId(clientId); setPreview(null); setPreviewError(''); setPreviewLoading(true);
    api.getPublicProfile(clientId).then(setPreview).catch((err) => setPreviewError(err.message)).finally(() => setPreviewLoading(false));
  }

  async function respond(id, status) {
    setRespondingId(id); setError('');
    try { await api.respondToAppointment(id, status); await load(); } catch (err) { setError(err.message); } finally { setRespondingId(null); }
  }
  async function remove(id) {
    setDeletingId(id); setError('');
    try { await api.deleteAppointment(id); await load(); } catch (err) { setError(err.message); } finally { setDeletingId(null); setConfirmDeleteId(null); }
  }

  const combined = useMemo(() => [...received.map((r) => ({ ...r, __dir: 'received' })), ...sent.map((r) => ({ ...r, __dir: 'sent' }))], [received, sent]);
  const appointmentDays = useMemo(() => new Set(combined.filter((a) => a.proposedAt).map((a) => dateKey(new Date(a.proposedAt)))), [combined]);
  const pendingCount = received.filter((r) => r.status === 'pending').length;
  const base = tab === 'received' ? received : sent;
  const filtered = selectedDay ? base.filter((r) => r.proposedAt && dateKey(new Date(r.proposedAt)) === selectedDay)
    : quickFilter !== 'all' ? base.filter((r) => r.proposedAt && matchesQuickFilter(new Date(r.proposedAt), quickFilter)) : base;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, totalPages);
  const list = filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  function selectMiniDate(date) {
    setWeekStart(startOfWeek(date)); setSelectedDay(dateKey(date)); setQuickFilter('all'); setPage(1);
    const first = new Date(date); first.setDate(1); setMiniMonth(first);
  }
  function today() { const t = new Date(); setWeekStart(startOfWeek(t)); setSelectedDay(null); const f = new Date(t); f.setDate(1); setMiniMonth(f); }
  function selectAppointment(a) {
    const clientId = a.__dir === 'received' ? a.fromClientId : a.toClientId;
    if (clientId) openPreview(clientId); else if (a.proposedAt) setSelectedDay(dateKey(new Date(a.proposedAt)));
  }

  return <Screen refreshing={false} onRefresh={load}>
    <Title subtitle="Requests to meet, sent from someone's Contacts list -- accept or decline the ones sent to you, or track the ones you've sent out.">Appointment Requests</Title>
    <MiniMonth shown={miniMonth} onShown={setMiniMonth} selectedDay={selectedDay} onSelect={selectMiniDate} appointmentDays={appointmentDays} />
    <WeekGrid weekStart={weekStart} onWeekChange={setWeekStart} onToday={today} appointments={combined} interval={interval} onInterval={setIntervalMinutes}
      selectedDay={selectedDay} onSelectDay={(day) => { setSelectedDay(day); setQuickFilter('all'); setPage(1); }} onSelectAppointment={selectAppointment} />

    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button compact kind={tab === 'received' ? 'primary' : 'secondary'} title={`Received${pendingCount ? ` (${pendingCount})` : ''}`} onPress={() => { setTab('received'); setPage(1); }} />
      <Button compact kind={tab === 'sent' ? 'primary' : 'secondary'} title="Sent" onPress={() => { setTab('sent'); setPage(1); }} />
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
      {QUICK_FILTERS.map((f) => { const on = quickFilter === f.key && !selectedDay; return <Pressable key={f.key} onPress={() => { setQuickFilter(f.key); setSelectedDay(null); setPage(1); }} style={[styles.filter, on && styles.filterOn]}><Text style={[styles.filterText, on && { color: '#06120f' }]}>{f.label}</Text></Pressable>; })}
    </ScrollView>

    <Message>{error}</Message>
    {loading ? <Loading /> : !list.length ? <Empty>{selectedDay ? 'Nothing on this day.' : tab === 'received' ? 'No appointment requests yet.' : "You haven't sent any appointment requests yet -- try the calendar icon on a contact."}</Empty> : list.map((r) => {
      const name = tab === 'received' ? r.fromName : r.toName;
      const clientId = tab === 'received' ? r.fromClientId : r.toClientId;
      return <Card key={r._id} style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Avatar uri={tab === 'received' ? resolveAssetUrl(r.fromPhotoUrl) : null} name={name} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            {clientId ? <Pressable onPress={() => openPreview(clientId)}><Text style={[styles.name, { textDecorationLine: 'underline' }]}>{name}</Text></Pressable> : <Text style={styles.name}>{name}</Text>}
            {tab === 'sent' ? <Text style={styles.meta}>{r.toPhone}{r.invitedViaSms && !r.toClientId ? ' · Invited via SMS, not on HuntsTAG yet' : ''}</Text> : null}
            {r.proposedAt ? <Text style={styles.when}>{formatDateTime(r.proposedAt)}</Text> : null}
            {r.note ? <Text style={styles.meta}>"{r.note}"</Text> : null}
          </View>
          <Text style={[styles.status, { color: STATUS_COLOR[r.status] }]}>{STATUS_LABEL[r.status]}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tab === 'received' && r.status === 'pending' ? <>
            <Button compact title="Accept" disabled={respondingId === r._id} onPress={() => respond(r._id, 'accepted')} style={{ flex: 1 }} />
            <Button compact kind="secondary" title="Decline" disabled={respondingId === r._id} onPress={() => respond(r._id, 'declined')} style={{ flex: 1 }} />
          </> : null}
          <Button compact kind="danger" icon="trash" title="Delete" disabled={deletingId === r._id} onPress={() => setConfirmDeleteId(r._id)} style={{ flex: 1 }} />
        </View>
      </Card>;
    })}
    {!loading && totalPages > 1 ? <View style={[styles.between, { justifyContent: 'center', gap: 14 }]}>
      <Button compact kind="secondary" title="Prev" disabled={clamped <= 1} onPress={() => setPage(clamped - 1)} />
      <Text style={styles.meta}>Page {clamped} of {totalPages}</Text>
      <Button compact kind="secondary" title="Next" disabled={clamped >= totalPages} onPress={() => setPage(clamped + 1)} />
    </View> : null}

    <Sheet visible={Boolean(previewId)} onClose={() => setPreviewId(null)} title={preview?.fullName || 'Profile'}>
      {previewLoading ? <Loading /> : previewError ? <Message>{previewError}</Message> : preview ? <>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Avatar uri={resolveAssetUrl(preview.photoUrl)} name={preview.fullName} size={56} />
          <View style={{ flex: 1 }}><Text style={styles.name}>{preview.fullName}</Text>{preview.jobTitle ? <Text style={styles.meta}>{preview.jobTitle}</Text> : null}</View>
        </View>
        {preview.bio ? <Text style={styles.bio}>{preview.bio}</Text> : null}
        {preview.phone ? <Button kind="secondary" icon="phone" title={preview.phone} onPress={() => Linking.openURL(`tel:${preview.phone}`)} /> : null}
        {preview.publicEmail ? <Button kind="secondary" icon="mail" title={preview.publicEmail} onPress={() => Linking.openURL(`mailto:${preview.publicEmail}`)} /> : null}
        <Button title="View full profile" onPress={() => { const id = previewId; setPreviewId(null); navigate('Card', { clientId: id }); }} />
      </> : null}
    </Sheet>

    <Sheet visible={Boolean(confirmDeleteId)} onClose={() => setConfirmDeleteId(null)} title="Delete this request?">
      <Text style={styles.meta}>This removes it for both sides and can't be undone.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" title="Cancel" onPress={() => setConfirmDeleteId(null)} disabled={deletingId === confirmDeleteId} style={{ flex: 1 }} />
        <Button kind="danger" title={deletingId === confirmDeleteId ? 'Deleting…' : 'Delete'} onPress={() => remove(confirmDeleteId)} disabled={deletingId === confirmDeleteId} style={{ flex: 1 }} />
      </View>
    </Sheet>
  </Screen>;
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  strong: { color: colors.text, fontWeight: '800', fontSize: 14 }, name: { color: colors.text, fontWeight: '800', fontSize: 15 }, meta: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  when: { color: colors.holoCyan, fontWeight: '700', fontSize: 12 }, status: { fontWeight: '800', fontSize: 12 }, bio: { color: colors.text, lineHeight: 21 },
  navBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center', color: colors.textDim, fontSize: 10 },
  day: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }, daySelected: { backgroundColor: colors.holoCyan }, dayToday: { borderWidth: 1, borderColor: colors.holoCyan },
  dayText: { color: colors.text, fontSize: 12 }, apptDot: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.holoCyan },
  intervals: { flexDirection: 'row', padding: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.panelBorder },
  interval: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 }, intervalOn: { backgroundColor: colors.holoCyan }, intervalText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },
  dayHead: { alignItems: 'center', paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' }, dayHeadSmall: { color: colors.textDim, fontSize: 10, textTransform: 'uppercase' }, dayHeadNum: { color: colors.text, fontWeight: '800', fontSize: 15 },
  slotLabel: { width: 62, color: colors.textDim, fontSize: 10, paddingTop: 7, paddingLeft: 4 },
  chip: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 }, chipText: { color: '#06120f', fontSize: 10, fontWeight: '700' },
  filter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.panelBorder }, filterOn: { backgroundColor: colors.holoCyan, borderColor: colors.holoCyan }, filterText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },
});
