import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { Button, Card, Empty, Field, Loading, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const emptyForm = { firstName: '', lastName: '', phone: '', email: '', org: '', address: '', notes: '' };

export default function ContactsScreen() {
  const [contacts, setContacts] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); const [form, setForm] = useState(emptyForm); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(''); try { setContacts(await api.listContacts()); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  function open(contact = null) { setEditing(contact || { _id: null }); setForm(contact ? Object.fromEntries(Object.keys(emptyForm).map((key) => [key, contact[key] || ''])) : emptyForm); }
  async function save() {
    setSaving(true); setError('');
    try { editing._id ? await api.updateContact(editing._id, form) : await api.createContact(form); setEditing(null); await load(); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  function remove(contact) {
    Alert.alert('Delete contact?', contact.name || contact.phone, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.deleteContact(contact._id); setContacts((list) => list.filter((item) => item._id !== contact._id)); } catch (err) { setError(err.message); } } }]);
  }
  return <Screen refreshing={loading} onRefresh={load}><Title subtitle="Private contacts saved to your huntsTAG account.">Contacts</Title><Message>{error}</Message><Button title="Add contact" onPress={() => open()} />
    {loading && !contacts.length ? <Loading /> : !contacts.length ? <Empty>No saved contacts yet.</Empty> : contacts.map((contact) => <Pressable key={contact._id} onPress={() => open(contact)}>
      <Card style={styles.contact}><View style={styles.avatar}><Text style={styles.initial}>{(contact.name || contact.phone || '?')[0].toUpperCase()}</Text></View><View style={styles.info}><Text style={styles.name}>{contact.name || contact.phone}</Text><Text style={styles.dim}>{contact.phone}</Text>{contact.org ? <Text style={styles.dim}>{contact.org}</Text> : null}</View><Button compact title="Delete" kind="danger" onPress={() => remove(contact)} /></Card>
    </Pressable>)}
    <Modal visible={Boolean(editing)} transparent animationType="slide" onRequestClose={() => setEditing(null)}><View style={styles.overlay}><View style={styles.modal}><Title>{editing?._id ? 'Edit contact' : 'Add contact'}</Title>
      {Object.keys(emptyForm).map((key) => <Field key={key} label={key.replace(/([A-Z])/g, ' $1')} value={form[key]} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} keyboardType={key === 'phone' ? 'phone-pad' : key === 'email' ? 'email-address' : 'default'} multiline={key === 'notes' || key === 'address'} />)}
      <View style={styles.actions}><Button title="Cancel" kind="secondary" onPress={() => setEditing(null)} style={styles.flex} /><Button title={saving ? 'Saving…' : 'Save'} disabled={saving || !form.phone.trim()} onPress={save} style={styles.flex} /></View>
    </View></View></Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panelRaised, alignItems: 'center', justifyContent: 'center' }, initial: { color: colors.holoCyan, fontWeight: '900', fontSize: 18 }, info: { flex: 1 }, name: { color: colors.text, fontWeight: '800', fontSize: 15 }, dim: { color: colors.textDim, fontSize: 12, marginTop: 2 }, overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' }, modal: { maxHeight: '92%', backgroundColor: colors.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 12 }, actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 },
});
