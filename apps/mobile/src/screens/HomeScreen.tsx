import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { COLORS } from '../theme/colors';
import { HeaderBar } from '../components/HeaderBar';
import { WorkoutSession } from '../models/workout';
import { DatabaseService } from '../services/storage/database';
import {
  Play,
  Mic,
  Calendar,
  Dumbbell,
  TrendingUp,
  BarChart2,
  ChevronRight,
  Flame,
  Award,
  RotateCcw,
} from 'lucide-react-native';
import { HapticsService } from '../services/audio/haptics';
import { useWorkout } from '../context/WorkoutContext';

interface HomeScreenProps {
  onStartLiveWorkout: () => void;
  onStartBatchWorkout: () => void;
  onOpenAnalytics: () => void;
  onOpenSettings: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onStartLiveWorkout,
  onStartBatchWorkout,
  onOpenAnalytics,
  onOpenSettings,
}) => {
  const { dataVersion, draftSession, resumeDraftWorkout, discardDraftWorkout } = useWorkout();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [stats, setStats] = useState({ totalSets: 0, totalVolume: 0, totalWorkouts: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      await DatabaseService.init();
      const [list, calculatedStats] = await Promise.all([
        DatabaseService.getAllSessions(20, 0),
        DatabaseService.getWorkoutStats(),
      ]);
      setSessions(list || []);
      if (calculatedStats) {
        setStats(calculatedStats);
      }
    } catch (e) {
      console.warn('[HomeScreen] loadData error:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [dataVersion]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const draftSetsCount = draftSession && Array.isArray(draftSession.groups)
    ? draftSession.groups.reduce((acc, g) => acc + (g?.sets?.length || 0), 0)
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <HeaderBar onSettingsPress={onOpenSettings} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primaryAccent} />
        }
      >
        {/* Active Draft Recovery Banner */}
        {draftSession && Array.isArray(draftSession.groups) && draftSession.groups.length > 0 && (
          <View style={styles.draftRecoveryBanner}>
            <View style={styles.draftIconContainer}>
              <RotateCcw size={20} color={COLORS.secondaryAccent} />
            </View>
            <View style={styles.draftTextContainer}>
              <Text style={styles.draftTitle}>Unfinished Workout Found</Text>
              <Text style={styles.draftSubtitle}>
                {draftSession.groups.length} exercises · {draftSetsCount} sets ready to resume
              </Text>
            </View>
            <View style={styles.draftActions}>
              <TouchableOpacity
                style={styles.resumeDraftBtn}
                onPress={() => {
                  resumeDraftWorkout();
                  onStartLiveWorkout();
                }}
              >
                <Text style={styles.resumeDraftBtnText}>Resume</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.discardDraftBtn} onPress={discardDraftWorkout}>
                <Text style={styles.discardDraftBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Weekly Stats Hero Card */}
        <View style={styles.heroStatsCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroSubtitle}>TOTAL VOLUME</Text>
              <Text style={styles.heroVolumeText}>
                {Math.round(stats.totalVolume).toLocaleString()} <Text style={styles.unitText}>KG</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={styles.analyticsButton}
              onPress={() => {
                HapticsService.lightTap();
                onOpenAnalytics();
              }}
              activeOpacity={0.7}
            >
              <BarChart2 size={16} color={COLORS.primaryAccent} />
              <Text style={styles.analyticsButtonText}>Analytics</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Workouts</Text>
              <Text style={styles.heroStatValue}>{stats.totalWorkouts || sessions.length}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Total Sets</Text>
              <Text style={styles.heroStatValue}>{stats.totalSets}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Streak</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Flame size={14} color={COLORS.secondaryAccent} />
                <Text style={[styles.heroStatValue, { color: COLORS.secondaryAccent }]}>4d</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Action Cards Section */}
        <Text style={styles.sectionTitle}>CHOOSE LOGGING MODE</Text>

        {/* Mode 1: Start Live Workout Card */}
        <TouchableOpacity
          style={styles.liveModeCard}
          onPress={() => {
            HapticsService.lightTap();
            onStartLiveWorkout();
          }}
          activeOpacity={0.85}
        >
          <View style={styles.cardGlowBar} />
          <View style={styles.modeCardHeader}>
            <View style={styles.modeBadgeLive}>
              <Play size={12} color={COLORS.secondaryAccent} fill={COLORS.secondaryAccent} />
              <Text style={styles.modeBadgeLiveText}>MODE 1 · INTERACTIVE</Text>
            </View>
            <ChevronRight size={20} color={COLORS.primaryAccent} />
          </View>

          <Text style={styles.modeCardTitle}>Start Live Workout</Text>
          <Text style={styles.modeCardDescription}>
            Set-by-set hands-free voice logging with auto 60s rest timer & smart context memory.
          </Text>

          <View style={styles.tagRow}>
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>⚡ &lt;100ms Voice Latency</Text>
            </View>
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>⏱️ Auto Rest Timer</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Mode 2: Log Whole Workout in One Go Card */}
        <TouchableOpacity
          style={styles.batchModeCard}
          onPress={() => {
            HapticsService.lightTap();
            onStartBatchWorkout();
          }}
          activeOpacity={0.85}
        >
          <View style={styles.modeCardHeader}>
            <View style={styles.modeBadgeBatch}>
              <Mic size={12} color={COLORS.primaryAccent} />
              <Text style={styles.modeBadgeBatchText}>MODE 2 · BATCH VOICE</Text>
            </View>
            <ChevronRight size={20} color={COLORS.textSecondary} />
          </View>

          <Text style={styles.modeCardTitle}>Log Whole Workout in One Go</Text>
          <Text style={styles.modeCardDescription}>
            Speak your entire completed routine in a single voice clip without timers.
          </Text>

          <View style={styles.tagRow}>
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>🎙️ Multi-Exercise Speech</Text>
            </View>
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>⚡ Instant Table Preview</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Past Workouts History */}
        <View style={styles.historySectionHeader}>
          <Text style={styles.sectionTitle}>RECENT WORKOUTS</Text>
          <Text style={styles.historyCountText}>{sessions.length} recorded</Text>
        </View>

        {(sessions || []).map((session, index) => {
          const sessionGroups = session.groups || [];
          const sessionVol = sessionGroups.reduce((gAcc, g) => {
            const groupSets = g?.sets || [];
            return gAcc + groupSets.reduce((setAcc, set) => setAcc + (set.weightValue || 0) * (set.reps || 0), 0);
          }, 0);
          const exercisesList = sessionGroups.map(g => g?.exerciseName).filter(Boolean).join(', ');

          return (
            <View key={session.id || index} style={styles.historyCard}>
              <View style={styles.historyCardHeader}>
                <View style={styles.dateRow}>
                  <Calendar size={14} color={COLORS.textSecondary} />
                  <Text style={styles.dateText}>{session.workoutDate}</Text>
                  <View style={styles.modeChip}>
                    <Text style={styles.modeChipText}>{session.mode}</Text>
                  </View>
                </View>
                <Text style={styles.historyVolText}>
                  {Math.round(sessionVol).toLocaleString()} kg
                </Text>
              </View>

              <Text style={styles.historyExercises} numberOfLines={2}>
                {exercisesList || 'No exercises logged'}
              </Text>

              <View style={styles.historyFooter}>
                <Text style={styles.historyFooterText}>
                  {session.groups.length} Exercises · {session.groups.reduce((a, g) => a + g.sets.length, 0)} Sets
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  heroStatsCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    gap: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  heroVolumeText: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  unitText: {
    fontSize: 14,
    color: COLORS.primaryAccent,
    fontWeight: '700',
  },
  analyticsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  analyticsButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryAccent,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    padding: 12,
    borderRadius: 12,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.borderDark,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  liveModeCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 255, 0, 0.4)',
    overflow: 'hidden',
    position: 'relative',
  },
  cardGlowBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.secondaryAccent,
  },
  modeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modeBadgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 255, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  modeBadgeLiveText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.secondaryAccent,
    letterSpacing: 0.5,
  },
  batchModeCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  modeBadgeBatch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cyanGlow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  modeBadgeBatchText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.primaryAccent,
    letterSpacing: 0.5,
  },
  modeCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  modeCardDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tagPill: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  historyCountText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    gap: 8,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modeChip: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modeChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  historyVolText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primaryAccent,
  },
  historyExercises: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  historyFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderDark,
    paddingTop: 8,
    marginTop: 4,
  },
  historyFooterText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  draftRecoveryBanner: {
    backgroundColor: '#1E1B10',
    borderColor: COLORS.secondaryAccent,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  draftIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftTextContainer: {
    flex: 1,
  },
  draftTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  draftSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  draftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resumeDraftBtn: {
    backgroundColor: COLORS.secondaryAccent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  resumeDraftBtnText: {
    color: '#0B0E14',
    fontSize: 12,
    fontWeight: '800',
  },
  discardDraftBtn: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  discardDraftBtnText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
});
