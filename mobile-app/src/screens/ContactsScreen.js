import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { api, resolveAssetUrl } from '../api/client.js';
import DateTimeField from '../components/DateTimeField.js';
import { Glyph } from '../components/Glyph.js';
import { pickMedia } from '../components/MediaUploader.js';
import { Avatar, Button, Card, Empty, Field, Loading, Message, Pill, Screen, Sheet, Title } from '../components/ui.js';
import { downloadAndShare, readFileBase64, writeAndShare } from '../lib/files.js';
import { formatDateTime, roundUpToNext5Min, splitName, waNumber } from '../lib/format.js';
import { colors } from '../theme/colors.js';

const EMPTY_FORM = { firstName: '', lastName: '', phone: '', email: '', org: '', address: '', notes: '' };

const HEADER_ALIASES = {
  firstName: ['first name', 'firstname'], lastName: ['last name', 'lastname', 'surname'], name: ['name', 'full name', 'contact name'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'tel', 'telephone'], email: ['email', 'email address'],
  org: ['org', 'organization', 'organisation', 'company'], address: ['address'], notes: ['notes', 'note'],
};

function rowToContact(row) {
  const lower = {};
  for (const [k, v] of Object.entries(row)) lower[k.trim().toLowerCase()] = v;
  const pick = (aliases) => { for (const key of aliases) if (lower[key] != null && String(lower[key]).trim()) return String(lower[key]).trim(); return ''; };
  let firstName = pick(HEADER_ALIASES.firstName);
  let lastName = pick(HEADER_ALIASES.lastName);
  if (!firstName && !lastName) ({ firstName, lastName } = splitName(pick(HEADER_ALIASES.name)));
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || pick(HEADER_ALIASES.name);
  return { name, firstName, lastName, phone: pick(HEADER_ALIASES.phone), email: pick(HEADER_ALIASES.email), org: pick(HEADER_ALIASES.org), address: pick(HEADER_ALIASES.address), notes: pick(HEADER_ALIASES.notes) };
}

const sheetToXlsxBase64 = (rows) => {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Contacts');
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
};

export default function ContactsScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [formMode, setFormMode] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [appt, setAppt] = useState(null);
  const [apptNote, setApptNote] = useState('');
  const [apptAt, setApptAt] = useState(null);
  const [busyTimes, setBusyTimes] = useState([]);
  const [apptSending, setApptSending] = useState(false);
  const [apptError, setApptError] = useState('');
  const [apptSent, setApptSent] = useState(null);
  const [sentIds, setSentIds] = useState(new Set());

  const load = useCallback(async () => {
    try { setContacts(await api.listContacts()); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = (key, fn) => async () => {
    setError(''); setImportResult(null); setBusy(key);
    try { await fn(); } catch (err) { if (err?.name !== 'AbortError') setError(err.message || 'Something went wrong.'); } finally { setBusy(''); }
  };

  // Native equivalent of the web's Contact Picker import.
  const importFromPhone = run('phone', async () => {
    const permission = await Contacts.requestPermissionsAsync();
    if (!permission.granted) throw new Error('Contacts permission is required to import from this phone.');
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Addresses, Contacts.Fields.Company] });
    const mapped = data.filter((c) => c.phoneNumbers?.length).map((c) => {
      const split = splitName(c.name || '');
      const addr = c.addresses?.[0];
      return {
        name: c.name || '', firstName: c.firstName || split.firstName, lastName: c.lastName || split.lastName,
        phone: c.phoneNumbers[0].number || '', email: c.emails?.[0]?.email || '', org: c.company || '',
        address: addr ? [addr.street, addr.city, addr.region, addr.postalCode, addr.country].filter(Boolean).join(', ') : '',
      };
    });
    if (!mapped.length) throw new Error('No contacts with a phone number were found on this phone.');
    setImportResult(await api.importContacts(mapped)); await load();
  });

  const exportVcf = run('vcf', () => downloadAndShare({ path: '/api/profile/contacts/export', filename: 'huntsTAG-contacts.vcf', mimeType: 'text/vcard', dialogTitle: 'Export contacts' }));

  const importExcel = run('excel', async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values', '*/*'], copyToCacheDirectory: true });
    if (result.canceled) return;
    let rows;
    try {
      const workbook = XLSX.read(await readFileBase64(result.assets[0].uri), { type: 'base64' });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    } catch { throw new Error('Could not read that file -- make sure it’s a valid Excel (.xlsx) or CSV file.'); }
    setImportResult(await api.importContacts(rows.map(rowToContact))); await load();
  });

  const exportExcel = run('xlsx', () => writeAndShare({
    filename: 'huntsTAG-contacts.xlsx', encoding: 'base64', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Export contacts',
    content: sheetToXlsxBase64(contacts.map((c) => ({ 'First Name': c.firstName || '', 'Last Name': c.lastName || '', Phone: c.phone, Email: c.email || '', Company: c.org || '', Address: c.address || '', Notes: c.notes || '' }))),
  }));

  const downloadTemplate = run('template', () => writeAndShare({
    filename: 'huntsTAG-contacts-template.xlsx', encoding: 'base64', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Contacts template',
    content: sheetToXlsxBase64([{ 'First Name': 'Jane', 'Last Name': 'Doe', Phone: '+91 98765 43210', Email: 'jane@example.com', Company: 'Acme Inc', Address: '123 Main St, Bengaluru', Notes: 'Met at HuntsTAG launch event' }]),
  }));

  function openForm(contact = null) {
    setFormMode(contact ? 'edit' : 'add'); setEditing(contact); setFormError(''); setPhoto(null);
    setForm(contact ? Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, contact[key] || ''])) : EMPTY_FORM);
  }
  const closeForm = () => { setFormMode(null); setEditing(null); setPhoto(null); setFormError(''); };

  async function chooseFormPhoto() {
    try { const asset = await pickMedia({ kind: 'image', editing: true, aspect: [1, 1], quality: 0.85 }); if (asset) setPhoto(asset); }
    catch (err) { setFormError(err.message); }
  }

  async function saveContact() {
    if (!form.phone.trim()) return setFormError('Phone number is required');
    setFormError(''); setSaving(true);
    try {
      const contact = formMode === 'edit' ? await api.updateContact(editing._id, form) : await api.createContact(form);
      if (photo) await api.uploadContactPhoto(contact._id, photo);
      await load(); closeForm();
    } catch (err) { setFormError(err.message); } finally { setSaving(false); }
  }

  function removeContact(contact) {
    Alert.alert('Remove contact?', 'Remove this contact from your HuntsTAG backup?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.deleteContact(contact._id); setContacts((list) => list.filter((c) => c._id !== contact._id)); } catch (err) { setError(err.message); } } },
    ]);
  }

  function openAppointment(contact) {
    setAppt(contact); setApptNote(''); setApptError(''); setBusyTimes([]); setApptSent(null);
    setApptAt(roundUpToNext5Min(new Date(Date.now() + 60 * 60 * 1000)));
    if (contact.phone) api.getAppointmentBusyTimes(contact.phone).then((res) => setBusyTimes(res.matched ? res.busy : [])).catch(() => {});
  }

  async function sendAppointment() {
    if (apptAt && apptAt.getTime() < Date.now()) return setApptError('That time has already passed -- pick a time in the future.');
    setApptSending(true); setApptError('');
    try {
      const request = await api.sendAppointmentRequest(appt._id, apptNote, apptAt?.toISOString());
      setSentIds((ids) => new Set(ids).add(appt._id)); setApptSent(request);
    } catch (err) { setApptError(err.message); } finally { setApptSending(false); }
  }

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const whatsappText = apptSent && appt ? (apptSent.toClientId
    ? `Hi ${appt.name.split(' ')[0]}, I just sent you an appointment request on HuntsTAG${apptSent.proposedAt ? ` for ${formatDateTime(apptSent.proposedAt, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}. Open the HuntsTAG app and check your Appointment Requests.`
    : `Hi, I'd like to schedule an appointment with you${apptSent.proposedAt ? ` for ${formatDateTime(apptSent.proposedAt, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}. Create your free HuntsTAG account to see my request.`) : '';

  return <Screen refreshing={false} onRefresh={load}>
    <Title subtitle="Back up your phone's contacts to your HuntsTAG account. If you switch phones, log in here and export to restore them.">Contacts</Title>
    <Message>{error}</Message>
    {importResult ? <Message tone="success">Imported {importResult.imported}, skipped {importResult.skipped} already saved.</Message> : null}

    <Card style={{ gap: 12 }}>
      <View style={styles.btnRow}>
        <Button compact kind="secondary" icon="download" title={busy === 'phone' ? 'Importing…' : 'Import from this phone'} disabled={Boolean(busy)} onPress={importFromPhone} />
        <Button compact kind="secondary" icon="upload" title={busy === 'vcf' ? 'Preparing…' : 'Export contacts'} disabled={Boolean(busy) || !contacts.length} onPress={exportVcf} />
      </View>
      <Text style={styles.hint}>Import picks contacts from this phone and adds any that aren't already saved here. Export gives you a file you can open on any phone to add them to its contacts app.</Text>
      <View style={styles.divider} />
      <View style={styles.btnRow}>
        <Button compact kind="secondary" icon="file" title={busy === 'excel' ? 'Importing…' : 'Upload Excel sheet'} disabled={Boolean(busy)} onPress={importExcel} />
        <Button compact kind="secondary" icon="download" title="Export to Excel" disabled={Boolean(busy) || !contacts.length} onPress={exportExcel} />
        <Button compact kind="secondary" icon="file" title="Download template" disabled={Boolean(busy)} onPress={downloadTemplate} />
      </View>
      <Text style={styles.hint}>Columns: First Name, Last Name, Phone, Email, Company, Address, Notes (header names are flexible, but if you're not sure, grab the template above and fill it in). Export gives you a spreadsheet you can re-upload on any device.</Text>
    </Card>

    <Card style={{ gap: 6 }}>
      <View style={styles.between}><Text style={styles.cardTitle}>Add a contact by hand</Text>{formMode !== 'add' ? <Button compact kind="secondary" icon="plus" title="Add contact" onPress={() => openForm()} /> : null}</View>
      <Text style={styles.hint}>For anything import can't carry -- a photo, a company, a note about where you met.</Text>
    </Card>

    {loading ? <Loading /> : !contacts.length ? <Empty>No contacts saved yet — use Import to add some from this phone.</Empty> : contacts.map((c) => (
      <Card key={c._id} style={styles.contact}>
        <Avatar uri={resolveAssetUrl(c.photoUrl)} name={c.name} size={46} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.name}>{c.name}</Text>
            {c.source === 'tap' ? <Pill>From card tap</Pill> : null}
          </View>
          <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)}><Text style={styles.meta}>{c.phone}{c.email ? ` · ${c.email}` : ''}</Text></Pressable>
          {c.org ? <Text style={styles.meta}>{c.org}</Text> : null}
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.iconBtn} onPress={() => openAppointment(c)}>{sentIds.has(c._id) ? <Glyph name="check" size={16} color={colors.holoCyan} /> : <Glyph name="calendar" size={16} />}</Pressable>
          <Pressable style={styles.iconBtn} onPress={() => openForm(c)}><Glyph name="edit" size={16} /></Pressable>
          <Pressable style={styles.iconBtn} onPress={() => removeContact(c)}><Glyph name="trash" size={16} color={colors.danger} /></Pressable>
        </View>
      </Card>
    ))}

    <Sheet visible={Boolean(formMode)} onClose={closeForm} title={formMode === 'edit' ? 'Edit contact' : 'Add contact'}>
      <Message>{formError}</Message>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar uri={photo?.uri || resolveAssetUrl(editing?.photoUrl)} name={form.firstName || form.lastName} size={64} />
        <View style={{ gap: 4 }}><Button compact kind="secondary" icon="camera" title={photo || editing?.photoUrl ? 'Change photo' : 'Choose photo'} onPress={chooseFormPhoto} /><Text style={styles.hint}>JPEG, PNG, or WEBP. Max 5MB.</Text></View>
      </View>
      <Field label="First name" value={form.firstName} onChangeText={set('firstName')} />
      <Field label="Last name" value={form.lastName} onChangeText={set('lastName')} />
      <Field label="Phone number" keyboardType="phone-pad" value={form.phone} onChangeText={set('phone')} />
      <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={set('email')} />
      <Field label="Company" value={form.org} onChangeText={set('org')} />
      <Field label="Address" value={form.address} onChangeText={set('address')} />
      <Field label="Notes" multiline value={form.notes} onChangeText={set('notes')} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" title="Cancel" onPress={closeForm} disabled={saving} style={{ flex: 1 }} />
        <Button title={saving ? 'Saving…' : formMode === 'edit' ? 'Save changes' : 'Add contact'} disabled={saving} onPress={saveContact} style={{ flex: 1 }} />
      </View>
    </Sheet>

    <Sheet visible={Boolean(appt)} onClose={() => setAppt(null)} title={apptSent ? 'Request sent' : 'Request an appointment'}>
      {apptSent ? <>
        <Text style={styles.hint}>{apptSent.toClientId ? `${appt.name} is already on HuntsTAG -- they've been emailed, and it's waiting on their Appointment Requests page.` : `We texted ${appt.name} a link to create an account and see it -- that text needs your SMS provider's template approved before it actually goes out.`}</Text>
        <Text style={styles.hint}>Want to make sure it doesn't get missed? Send it yourself too:</Text>
        <Button title="Send via WhatsApp" icon="chat" onPress={() => Linking.openURL(`https://wa.me/${waNumber(appt.phone)}?text=${encodeURIComponent(whatsappText)}`)} />
        <Button kind="secondary" title="Done" onPress={() => setAppt(null)} />
      </> : appt ? <>
        <Text style={styles.hint}>{appt.name} — if they're already on HuntsTAG they'll see this on their Appointment Requests page (and get emailed); otherwise we'll text them a link to create an account and view it.</Text>
        <Message>{apptError}</Message>
        <DateTimeField label="Proposed date & time (optional)" mode="datetime" value={apptAt} minimumDate={new Date()} clearable onChange={setApptAt} />
        {busyTimes.length ? <Text style={styles.hint}>{appt.name} already has an appointment around: {busyTimes.map((t) => formatDateTime(t, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })).join(', ')}</Text> : null}
        <Field label="Note (optional)" multiline maxLength={500} placeholder="What's this about…" value={apptNote} onChangeText={setApptNote} />
        <Button title={apptSending ? 'Sending…' : 'Send request'} disabled={apptSending} onPress={sendAppointment} />
      </> : null}
    </Sheet>
    <Button kind="ghost" title="View appointment requests →" onPress={() => navigation.navigate('Appointment Requests')} />
  </Screen>;
}

const styles = StyleSheet.create({
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, divider: { height: 1, backgroundColor: colors.panelBorder },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 18 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }, name: { color: colors.text, fontWeight: '800', fontSize: 15 }, meta: { color: colors.textDim, fontSize: 12 },
  actions: { gap: 6 }, iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.panelBorder, alignItems: 'center', justifyContent: 'center' },
});
