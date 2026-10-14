import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Screen, Title } from '../components/ui.js';
import { LEGAL_UPDATED, PRIVACY, TERMS } from '../lib/legalContent.js';
import { colors } from '../theme/colors.js';

function Bullets({ items }) {
  return items ? <View style={{ gap: 6 }}>{items.map((t) => <View key={t} style={styles.row}><Text style={styles.dot}>•</Text><Text style={styles.body}>{t}</Text></View>)}</View> : null;
}

function LegalDocument({ doc, otherTitle, onOther }) {
  return <Screen>
    <Title eyebrow={`Last updated ${doc.updated || LEGAL_UPDATED}`} subtitle={doc.intro}>{doc.title}</Title>
    {doc.sections.map((s) => <Card key={s.h} style={{ gap: 8 }}>
      <Text style={styles.h2}>{s.h}</Text>
      {s.p?.map((t) => <Text key={t} style={styles.body}>{t}</Text>)}
      <Bullets items={s.ul} />
      {s.subs?.map((sub) => <View key={sub.h} style={{ gap: 6, marginTop: 4 }}>
        <Text style={styles.h3}>{sub.h}</Text>
        {sub.p?.map((t) => <Text key={t} style={styles.body}>{t}</Text>)}
        <Bullets items={sub.ul} />
      </View>)}
    </Card>)}
    <Button kind="ghost" title={`${otherTitle} →`} onPress={onOther} />
  </Screen>;
}

export function PrivacyPolicyScreen({ navigation }) {
  return <LegalDocument doc={PRIVACY} otherTitle="Terms & Conditions" onOther={() => navigation.navigate('Terms & Conditions')} />;
}

export function TermsScreen({ navigation }) {
  return <LegalDocument doc={TERMS} otherTitle="Privacy Policy" onOther={() => navigation.navigate('Privacy Policy')} />;
}

const styles = StyleSheet.create({
  h2: { color: colors.text, fontSize: 17, fontWeight: '800' },
  h3: { color: colors.text, fontSize: 14, fontWeight: '700' },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 21, flexShrink: 1 },
  row: { flexDirection: 'row', gap: 8 },
  dot: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
});
