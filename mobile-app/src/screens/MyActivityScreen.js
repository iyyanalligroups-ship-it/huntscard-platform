import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client.js';
import DateTimeField from '../components/DateTimeField.js';
import { Button, Card, Empty, Loading, Message, Screen, Title } from '../components/ui.js';
import { dayKeyOf, fmtDay, fmtTime, minutesText, plural } from '../lib/activityFormat.js';
import { colors } from '../theme/colors.js';

const REFRESH_MS = 15000;
const GREEN = '#1e9e57';
const endText = (s) => (s.endedAt ? (s.endReason === 'switched' ? 'switched account' : 'logged out') : s.active ? 'active now' : 'no logout');

// The person's own record of logins and what they did, by day -> session -> steps (same as the website's
// My Activity). 7 days at a time with "Load more", refreshes itself every 15 seconds while the screen is
// open, and opens the session you are in right now.
export default function MyActivityScreen() {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [pages, setPages] = useState(1); // pages of 7 days loaded so far
  const [data, setData] = useState(null); // { days, total, currentSid }
  const [error, setError] = useState('');
  const [openDay, setOpenDay] = useState('');
  const [openSid, setOpenSid] = useState('');
  const [sessions, setSessions] = useState({}); // day -> sessions (with steps)
  const [loadingMore, setLoadingMore] = useState(false);
  const autoOpened = useRef(false);
  const view = useRef({});
  view.current = { from, to, pages, openDay };

  const loadDay = useCallback(async (day) => {
    const r = await api.myActivityDay(day);
    setSessions((s) => ({ ...s, [day]: r.sessions }));
    return r.sessions;
  }, []);

  const load = useCallback(async ({ auto = false } = {}) => {
    try {
      const { from: f, to: t, pages: count, openDay: od } = view.current;
      let days = [];
      let total = 0;
      let currentSid = null;
      for (let page = 1; page <= count; page += 1) { // keep every page already loaded up to date
        const r = await api.myActivity({ from: dayKeyOf(f), to: dayKeyOf(t), page });
        days = days.concat(r.days);
        total = r.total;
        currentSid = r.currentSid;
        if (days.length >= total) break;
      }
      setData({ days, total, currentSid });
      setError('');
      if (od) loadDay(od).catch(() => {});
      // First time with no filter: open the session this very login is in.
      if (!auto && !autoOpened.current && !f && !t && currentSid) {
        autoOpened.current = true;
        const live = days.find((d) => d.activeNow);
        if (live) {
          const list = await loadDay(live.day);
          const mine = list.find((s) => s.current) || list.find((s) => s.active);
          setOpenDay(live.day);
          if (mine) setOpenSid(mine.sid);
        }
      }
    } catch (err) {
      // An old server that does not know this screen yet answers "Not found": say that plainly.
      if (!auto) setError(err.message === 'Not found' ? 'My activity is not available right now. Please try again in a little while.' : err.message);
    }
  }, [loadDay]);

  useEffect(() => { setPages(1); }, [from, to]);
  useEffect(() => { load(); }, [load, from, to, pages]);

  // Refresh by itself every 15 seconds, only while this screen is in front and the app is open.
  useFocusEffect(useCallback(() => {
    load({ auto: true });
    const timer = setInterval(() => { if (AppState.currentState === 'active') load({ auto: true }); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]));

  async function toggleDay(day) {
    if (openDay === day) { setOpenDay(''); setOpenSid(''); return; }
    setOpenDay(day);
    setOpenSid('');
    try { await loadDay(day); } catch (err) { setError(err.message); }
  }

  async function loadMore() {
    setLoadingMore(true);
    setPages((p) => p + 1);
    setTimeout(() => setLoadingMore(false), 600);
  }

  const left = data ? data.total - data.days.length : 0;

  return <Screen refreshing={false} onRefresh={() => load()}>
    <Title subtitle="Your logins and what you did while logged in. Times are India time. Passwords, OTPs and card or bank details are never recorded.">My activity</Title>

    <Card style={{ gap: 12 }}>
      <DateTimeField label="From" value={from} maximumDate={to || new Date()} clearable onChange={setFrom} />
      <DateTimeField label="To" value={to} minimumDate={from || undefined} maximumDate={new Date()} clearable onChange={setTo} />
    </Card>

    <Message>{error}</Message>
    {!data && !error ? <Loading /> : null}
    {data && data.days.length === 0 ? <Empty>{from || to ? 'No activity in these dates.' : 'No activity recorded yet. It will appear here after you log in and use your account.'}</Empty> : null}

    {data?.days.map((d) => (
      <View key={d.day} style={styles.day}>
        <Pressable onPress={() => toggleDay(d.day)} style={styles.toggle} accessibilityRole="button" accessibilityState={{ expanded: openDay === d.day }}>
          <Text style={styles.chev}>{openDay === d.day ? '▾' : '▸'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.strong}>{fmtDay(d.day)}{d.activeNow ? '  ' : ''}{d.activeNow ? <Text style={styles.live}> Active now </Text> : null}</Text>
            <Text style={styles.small}>Logged in {plural(d.logins, 'time')}, logged out {d.logouts}, {d.things} {d.things === 1 ? 'thing' : 'things'} done, {minutesText(d.minutes)} online</Text>
          </View>
        </Pressable>

        {openDay === d.day ? (
          <View style={styles.sessions}>
            {!sessions[d.day] ? <Loading /> : sessions[d.day].map((s) => (
              <View key={s.sid} style={styles.session}>
                <Pressable onPress={() => setOpenSid(openSid === s.sid ? '' : s.sid)} style={styles.toggle} accessibilityRole="button" accessibilityState={{ expanded: openSid === s.sid }}>
                  <Text style={styles.chev}>{openSid === s.sid ? '▾' : '▸'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strong}>{fmtTime(s.startedAt)} → {s.endedAt ? fmtTime(s.endedAt) : s.active ? 'now' : fmtTime(s.lastActivityAt)}{s.current ? <Text style={styles.live}>  This device </Text> : null}</Text>
                    <Text style={styles.small}>{s.platform === 'app' ? 'App' : 'Website'} · {minutesText(s.minutes)} · {plural(s.things, 'thing')} done · {endText(s)}</Text>
                  </View>
                </Pressable>
                {openSid === s.sid ? (
                  <View style={styles.steps}>
                    {s.events.map((e, i) => (
                      <View key={i} style={styles.step}>
                        <Text style={styles.time}>{fmtTime(e.at)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>{e.label}</Text>
                          {e.changes.map((c, k) => (
                            <View key={k} style={styles.change}>
                              <Text style={styles.field}>{c.label}</Text>
                              <Text style={styles.before}>{c.before || '(empty)'}</Text>
                              <Text style={styles.after}>{c.after || '(empty)'}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                    {s.trimmed ? <Text style={styles.small}>Only the latest steps of a very long session are kept.</Text> : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    ))}

    {data && left > 0 ? <Button title={`Load more (${plural(left, 'day')} left)`} kind="secondary" loading={loadingMore} onPress={loadMore} /> : null}
    {data && data.total > 0 ? <Text style={styles.small}>Showing {data.days.length} of {data.total} days. This screen refreshes by itself every 15 seconds.</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  day: { borderWidth: 1, borderColor: colors.panelBorder, backgroundColor: colors.panel, borderRadius: 12, overflow: 'hidden' },
  toggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  chev: { color: colors.textDim, width: 14, textAlign: 'center', marginTop: 1 },
  strong: { color: colors.text, fontWeight: '700', fontSize: 15 },
  small: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  live: { color: GREEN, fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(40,199,111,0.16)' },
  sessions: { paddingLeft: 14, paddingRight: 8, paddingBottom: 8 },
  session: { borderLeftWidth: 2, borderLeftColor: colors.panelBorder, marginTop: 4 },
  steps: { paddingLeft: 24, paddingBottom: 8, gap: 2 },
  step: { flexDirection: 'row', gap: 10, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.panelBorder },
  time: { color: colors.textDim, fontSize: 12, width: 78 },
  label: { color: colors.text, fontSize: 13 },
  change: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 3 },
  field: { color: colors.text, fontWeight: '700', fontSize: 12 },
  before: { color: '#d33a3a', backgroundColor: 'rgba(234,84,85,0.12)', fontSize: 12, textDecorationLine: 'line-through', paddingHorizontal: 4, borderRadius: 4 },
  after: { color: GREEN, backgroundColor: 'rgba(40,199,111,0.14)', fontSize: 12, paddingHorizontal: 4, borderRadius: 4 },
});
