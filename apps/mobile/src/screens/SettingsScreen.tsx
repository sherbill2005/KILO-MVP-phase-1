import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  SafeAreaView,
} from 'react-native';
import { COLORS } from '../theme/colors';
import { PreferencesService } from '../services/storage/preferences';
import { DatabaseService } from '../services/storage/database';
import { WeightUnit } from '../models/workout';
import { HapticsService } from '../services/audio/haptics';
import { SpeechReceiptsService } from '../services/audio/speechReceipts';
import { SyncService } from '../services/storage/syncService';
import {
  ArrowLeft,
  Headphones,
  Sliders,
  CloudCheck,
  RefreshCw,
  Info,
  Shield,
  Zap,
} from 'lucide-react-native';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [defaultUnit, setDefaultUnit] = useState<WeightUnit>('kg');
  const [restTimerSec, setRestTimerSec] = useState<number>(60);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      const t = await PreferencesService.getTtsEnabled();
      const u = await PreferencesService.getDefaultUnit();
      const r = await PreferencesService.getRestTimerDuration();
      const pending = await DatabaseService.getPendingSyncCount();

      setTtsEnabled(t);
      setDefaultUnit(u);
      setRestTimerSec(r);
      setPendingSyncCount(pending);
    };
    load();
  }, []);

  const handleToggleTts = async (value: boolean) => {
    HapticsService.lightTap();
    setTtsEnabled(value);
    await PreferencesService.setTtsEnabled(value);
    if (value) {
      SpeechReceiptsService.speakMessage('Earbud receipts enabled');
    }
  };

  const handleSelectUnit = async (unit: WeightUnit) => {
    HapticsService.lightTap();
    setDefaultUnit(unit);
    await PreferencesService.setDefaultUnit(unit);
  };

  const handleSelectRestTime = async (seconds: number) => {
    HapticsService.lightTap();
    setRestTimerSec(seconds);
    await PreferencesService.setRestTimerDuration(seconds);
  };

  const handleSyncNow = async () => {
    HapticsService.lightTap();
    setIsSyncing(true);
    const result = await SyncService.syncPendingWorkouts();
    const count = await DatabaseService.getPendingSyncCount();
    setPendingSyncCount(count);
    setIsSyncing(false);
    HapticsService.setLoggedSuccess();
    if (result.isOnline) {
      Alert.alert(
        'Cloud Sync Successful',
        result.syncedCount > 0
          ? `Synced ${result.syncedCount} workout sessions to Cloudflare Worker KV.`
          : 'All workout data is already up to date.'
      );
    } else {
      Alert.alert('Offline Mode', 'Could not reach server. Workout data remains safe locally in SQLite.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>SETTINGS</Text>
          <Text style={styles.headerSubtitle}>Audio, Units & Cloud Sync</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Group 1: Audio & Earbud Receipts */}
        <Text style={styles.groupTitle}>AUDIO & TACTILE FEEDBACK</Text>
        <View style={styles.groupCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingIconWrapper}>
              <Headphones size={20} color={COLORS.primaryAccent} />
            </View>
            <View style={styles.settingTextWrapper}>
              <Text style={styles.settingLabel}>Earbud Audio Receipts (TTS)</Text>
              <Text style={styles.settingDescription}>
                Hear snappy voice confirmations in headphones when sets are logged.
              </Text>
            </View>
            <Switch
              value={ttsEnabled}
              onValueChange={handleToggleTts}
              trackColor={{ false: COLORS.surfaceElevated, true: COLORS.primaryAccent }}
              thumbColor={COLORS.textPrimary}
            />
          </View>
        </View>

        {/* Group 2: Workout Defaults */}
        <Text style={styles.groupTitle}>WORKOUT PREFERENCES</Text>
        <View style={styles.groupCard}>
          {/* Default Unit */}
          <View style={styles.settingRowStacked}>
            <Text style={styles.settingLabel}>Default Weight Unit</Text>
            <View style={styles.unitSelector}>
              <TouchableOpacity
                style={[styles.unitBtn, defaultUnit === 'kg' && styles.unitBtnActive]}
                onPress={() => handleSelectUnit('kg')}
              >
                <Text style={[styles.unitBtnText, defaultUnit === 'kg' && styles.unitBtnTextActive]}>
                  Kilograms (KG)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitBtn, defaultUnit === 'lb' && styles.unitBtnActive]}
                onPress={() => handleSelectUnit('lb')}
              >
                <Text style={[styles.unitBtnText, defaultUnit === 'lb' && styles.unitBtnTextActive]}>
                  Pounds (LB)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Auto Rest Timer Default */}
          <View style={styles.settingRowStacked}>
            <Text style={styles.settingLabel}>Default Rest Timer</Text>
            <View style={styles.timerSelectorRow}>
              {[30, 45, 60, 90, 120].map(sec => (
                <TouchableOpacity
                  key={sec}
                  style={[styles.timerChip, restTimerSec === sec && styles.timerChipActive]}
                  onPress={() => handleSelectRestTime(sec)}
                >
                  <Text style={[styles.timerChipText, restTimerSec === sec && styles.timerChipTextActive]}>
                    {sec}s
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Group 3: Offline & Cloud Sync */}
        <Text style={styles.groupTitle}>CLOUD & OFFLINE ENGINE</Text>
        <View style={styles.groupCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingIconWrapper}>
              <CloudCheck size={20} color={COLORS.success} />
            </View>
            <View style={styles.settingTextWrapper}>
              <Text style={styles.settingLabel}>Offline-First Storage</Text>
              <Text style={styles.settingDescription}>
                {pendingSyncCount > 0
                  ? `${pendingSyncCount} changes waiting to sync`
                  : '100% Up-to-date with Cloudflare D1'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.syncBtn}
              onPress={handleSyncNow}
              disabled={isSyncing}
              activeOpacity={0.7}
            >
              <RefreshCw size={14} color={COLORS.bgBase} />
              <Text style={styles.syncBtnText}>{isSyncing ? 'Syncing...' : 'Sync'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Group 4: About & Privacy */}
        <Text style={styles.groupTitle}>ABOUT KILO</Text>
        <View style={styles.groupCard}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0-MOBILE (Production)</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Speech Recognition</Text>
            <Text style={styles.aboutValue}>On-Device + Fallback</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Developer Machine Footprint</Text>
            <Text style={styles.aboutValue}>0 GB SDK · Lightweight Expo</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDark,
    backgroundColor: COLORS.bgBase,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceCard,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 2,
  },
  groupCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    gap: 14,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingRowStacked: {
    gap: 10,
  },
  settingIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTextWrapper: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  settingDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  unitSelector: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 10,
    padding: 3,
  },
  unitBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  unitBtnActive: {
    backgroundColor: COLORS.primaryAccent,
  },
  unitBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  unitBtnTextActive: {
    color: COLORS.bgBase,
    fontWeight: '800',
  },
  timerSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timerChip: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  timerChipActive: {
    borderColor: COLORS.primaryAccent,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
  },
  timerChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  timerChipTextActive: {
    color: COLORS.primaryAccent,
    fontWeight: '800',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  syncBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.bgBase,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderDark,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  aboutValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
