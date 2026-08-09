import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius } from '../theme/colors.js';
import { ShieldIcon, CheckCircleIcon, WarnCircleIcon, UnknownCircleIcon, ChevronRightIcon } from '../components/Icons.js';
import { getDeviceSafetyStatus } from '../native/deviceSafety.js';
import { evaluateChecks } from '../lib/deviceSafetyChecks.js';

const STATE_COLOR = {
  pass: colors.holoCyan,
  warn: colors.warning,
  fail: colors.danger,
  unknown: colors.textDim,
};
const STATE_ICON = {
  pass: CheckCircleIcon,
  warn: WarnCircleIcon,
  fail: WarnCircleIcon,
  unknown: UnknownCircleIcon,
};

// A settings checklist, not antivirus -- see the native module for why:
// no scanning, no background service, nothing sent anywhere. This screen
// only reads a handful of on-device settings each time it's opened (or
// pulled to refresh), and links straight to the relevant Android Settings
// page so the user can fix anything themselves in one tap.
export default function DeviceSafetyCheckScreen() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const runCheck = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    setError('');
    try {
      const result = await getDeviceSafetyStatus();
      setStatus(result);
    } catch (err) {
      setError(err.message || 'Could not read device settings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-run every time this screen gains focus -- most likely because the
  // user just came back from fixing something in Settings.
  useFocusEffect(
    useCallback(() => {
      runCheck(false);
    }, [runCheck])
  );

  const checks = status ? evaluateChecks(status) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => runCheck(true)} tintColor={colors.holoCyan} />}
    >
      <View style={styles.headerRow}>
        <ShieldIcon color={colors.holoCyan} size={26} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.title}>Device Protection Check</Text>
          <Text style={styles.subtitle}>
            A quick look at a few phone settings -- nothing is scanned, nothing leaves this device.
          </Text>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.holoCyan} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => runCheck(false)} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && checks && (
        <>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreText}>
              {checks.total > 0 ? `${checks.passCount} of ${checks.total} checks passed` : "Couldn't determine device status"}
            </Text>
            <View style={styles.scoreDots}>
              {checks.items.map((item) => (
                <View key={item.key} style={[styles.scoreDot, { backgroundColor: STATE_COLOR[item.state] }]} />
              ))}
            </View>
          </View>

          <View style={styles.list}>
            {checks.items.map((item) => (
              <CheckRow key={item.key} item={item} />
            ))}
          </View>

          <Text style={styles.footnote}>
            Pull down to re-check, or come back to this screen after changing a setting.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function CheckRow({ item }) {
  const StateIcon = STATE_ICON[item.state];
  const iconColor = STATE_COLOR[item.state];
  // A confirmed hacking tool gets a visibly different, more serious card --
  // still calm/factual wording, but this is the one place a real, concrete
  // danger is being reported rather than a routine settings nudge.
  const isDanger = item.state === 'fail';

  return (
    <View style={[styles.row, isDanger && styles.rowDanger]}>
      <StateIcon color={iconColor} size={22} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.rowLabel}>{item.label}</Text>
        <Text style={styles.rowDetail}>{item.detail}</Text>
        {item.explain && <Text style={styles.rowExplain}>{item.explain}</Text>}
      </View>
      {item.onAction && (
        <Pressable onPress={item.onAction} style={styles.rowAction} hitSlop={8}>
          <Text style={styles.rowActionText}>{item.actionLabel}</Text>
          <ChevronRightIcon color={colors.holoCyan} size={16} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.space,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorBox: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    padding: 16,
    alignItems: 'flex-start',
  },
  errorText: {
    color: colors.textDim,
    fontSize: 13,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: colors.panelRaised,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  retryButtonText: {
    color: colors.holoCyan,
    fontSize: 13,
    fontWeight: '600',
  },
  scoreCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    padding: 16,
    marginBottom: 16,
  },
  scoreText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  scoreDots: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6,
  },
  scoreDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    padding: 14,
  },
  rowDanger: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(244, 116, 106, 0.08)',
  },
  rowLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowDetail: {
    color: colors.textDim,
    fontSize: 12.5,
    marginTop: 3,
  },
  rowExplain: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
    opacity: 0.85,
  },
  rowAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 2,
  },
  rowActionText: {
    color: colors.holoCyan,
    fontSize: 12,
    fontWeight: '600',
  },
  footnote: {
    color: colors.textDim,
    fontSize: 11.5,
    marginTop: 18,
    textAlign: 'center',
    opacity: 0.8,
  },
});
