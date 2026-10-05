import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { Button, Card, Message, Screen, Title } from '../components/ui.js';
import { colors } from '../theme/colors.js';

const POLL_MS = 5000;

export default function ChatScreen({ navigation }) {
  const { session } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    try { setMessages(await api.getChat()); setError(''); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!session) return undefined;
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load, session]));

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }, [messages]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true); setError('');
    try { const sent = await api.sendChatMessage(value); setMessages((current) => [...current, sent]); setText(''); }
    catch (err) { setError(err.message); } finally { setSending(false); }
  }

  if (!session) {
    return <Screen>
      <Title subtitle="Message our team directly and get a reply here.">Chat Support</Title>
      <Card style={{ gap: 12 }}>
        <Text style={styles.empty}>Log in to start a conversation with support.</Text>
        <Button title="Log in" onPress={() => navigation.navigate('Login')} />
      </Card>
    </Screen>;
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <View style={styles.header}><Title subtitle="Message our team directly and get a reply here. Replies sync with the support chat on the website.">Chat Support</Title><Message>{error}</Message></View>
    <ScrollView ref={scrollRef} style={styles.list} contentContainerStyle={styles.content}>
      {loading ? <Text style={styles.empty}>Loading…</Text> : !messages.length ? <Card><Text style={styles.empty}>No messages yet — say hello, our team usually replies soon.</Text></Card> : messages.map((message) => <View key={message._id} style={[styles.bubble, message.sender === 'client' ? styles.mine : styles.theirs]}>
        <Text style={styles.body}>{message.text}</Text>
        <Text style={styles.time}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>)}
    </ScrollView>
    <View style={styles.composer}>
      <TextInput value={text} onChangeText={setText} placeholder="Type a message…" placeholderTextColor={colors.textDim} style={styles.input} maxLength={4000} multiline />
      <Button compact title={sending ? '…' : 'Send'} onPress={send} disabled={sending || !text.trim()} />
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.space }, header: { padding: 18, paddingBottom: 8, gap: 8 }, list: { flex: 1 }, content: { padding: 18, gap: 9 },
  bubble: { maxWidth: '82%', borderRadius: 14, padding: 12, gap: 5 },
  mine: { alignSelf: 'flex-end', backgroundColor: 'rgba(21,101,255,0.16)', borderBottomRightRadius: 3 }, theirs: { alignSelf: 'flex-start', backgroundColor: colors.panel, borderBottomLeftRadius: 3 },
  body: { color: colors.text, lineHeight: 20 }, time: { color: colors.textDim, fontSize: 10, alignSelf: 'flex-end' }, empty: { color: colors.textDim, textAlign: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.panelBorder },
  input: { flex: 1, color: colors.text, backgroundColor: colors.panelRaised, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, maxHeight: 100 },
});
