import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { COLORS } from '../theme/colors';
import { CANONICAL_EXERCISES } from '../models/exercises';
import { DatabaseService } from '../services/storage/database';
import { WorkoutSession, calculateBrzycki1RM, calculateEpley1RM } from '../models/workout';
import { ArrowLeft, TrendingUp, Award, PieChart, Activity, ChevronDown } from 'lucide-react-native';
import { HapticsService } from '../services/audio/haptics';

interface AnalyticsScreenProps {
  onBack: () => void;
}

import { useWorkout } from '../context/WorkoutContext';

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({ onBack }) => {
  const { dataVersion } = useWorkout();
  const [activeTab, setActiveTab] = useState<'1RM' | 'VOLUME'>('1RM');
  const [selectedExercise, setSelectedExercise] = useState<string>('Bench Press');
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    const load = async () => {
      const list = await DatabaseService.getAllSessions(100, 0);
      setSessions(list);
    };
    load();
  }, [dataVersion]);

  // Compute stats for selected exercise (memoized to prevent JS thread freezing)
  const { bestWeight, bestReps, allSets, brzycki1RM, epley1RM } = useMemo(() => {
    let bWeight = 0;
    let bReps = 0;
    const setsList: { date: string; weight: number; reps: number; est1RM: number }[] = [];

    for (const session of sessions) {
      for (const group of session.groups) {
        if (group.exerciseName.toLowerCase() === selectedExercise.toLowerCase()) {
          for (const set of group.sets) {
            const est = set.reps <= 1 ? set.weightValue : calculateEpley1RM(set.weightValue, set.reps);
            setsList.push({
              date: session.workoutDate,
              weight: set.weightValue,
              reps: set.reps,
              est1RM: est,
            });
            if (est > calculateEpley1RM(bWeight, bReps)) {
              bWeight = set.weightValue;
              bReps = set.reps;
            }
          }
        }
      }
    }

    return {
      bestWeight: bWeight,
      bestReps: bReps,
      allSets: setsList,
      brzycki1RM: calculateBrzycki1RM(bWeight, bReps),
      epley1RM: calculateEpley1RM(bWeight, bReps),
    };
  }, [sessions, selectedExercise]);

  // Muscle Volume Distribution
  const muscleDistribution: Record<string, number> = {
    Chest: 0,
    Back: 0,
    Legs: 0,
    Shoulders: 0,
    Arms: 0,
    Core: 0,
  };

  let totalDistVolume = 0;

  for (const session of sessions) {
    for (const group of session.groups) {
      const def = CANONICAL_EXERCISES.find(e => e.name.toLowerCase() === group.exerciseName.toLowerCase());
      const muscle = def?.primaryMuscle || 'Arms';
      const vol = group.sets.reduce((sum, s) => sum + s.weightValue * s.reps, 0);
      muscleDistribution[muscle] = (muscleDistribution[muscle] || 0) + vol;
      totalDistVolume += vol;
    }
  }

  const musclePercentages = Object.entries(muscleDistribution).map(([muscle, vol]) => ({
    muscle,
    vol,
    percent: totalDistVolume > 0 ? Math.round((vol / totalDistVolume) * 100) : 0,
  }));

  const POPULAR_EXERCISES = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Incline Bench Press', 'Barbell Row'];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>ANALYTICS & 1RM</Text>
          <Text style={styles.headerSubtitle}>Progression & Volume Load</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Segmented Control */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === '1RM' && styles.segmentBtnActive]}
            onPress={() => {
              HapticsService.lightTap();
              setActiveTab('1RM');
            }}
          >
            <TrendingUp size={15} color={activeTab === '1RM' ? COLORS.bgBase : COLORS.textSecondary} />
            <Text style={[styles.segmentText, activeTab === '1RM' && styles.segmentTextActive]}>
              1RM Strength
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'VOLUME' && styles.segmentBtnActive]}
            onPress={() => {
              HapticsService.lightTap();
              setActiveTab('VOLUME');
            }}
          >
            <PieChart size={15} color={activeTab === 'VOLUME' ? COLORS.bgBase : COLORS.textSecondary} />
            <Text style={[styles.segmentText, activeTab === 'VOLUME' && styles.segmentTextActive]}>
              Muscle Breakdown
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === '1RM' ? (
          <>
            {/* Exercise Selector Chips */}
            <Text style={styles.sectionLabel}>SELECT EXERCISE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exerciseChipsRow}>
              {POPULAR_EXERCISES.map(ex => (
                <TouchableOpacity
                  key={ex}
                  style={[styles.chip, selectedExercise === ex && styles.chipActive]}
                  onPress={() => {
                    HapticsService.lightTap();
                    setSelectedExercise(ex);
                  }}
                >
                  <Text style={[styles.chipText, selectedExercise === ex && styles.chipTextActive]}>
                    {ex}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 1RM Strength Overview Card */}
            <View style={styles.heroProgressionCard}>
              <View style={styles.heroTopRow}>
                <View>
                  <Text style={styles.exerciseCardTitle}>{selectedExercise}</Text>
                  <Text style={styles.prSubtitle}>ESTIMATED 1-REP MAX</Text>
                </View>
                <View style={styles.prBadge}>
                  <Award size={16} color={COLORS.secondaryAccent} />
                  <Text style={styles.prBadgeText}>PR: {epley1RM} kg</Text>
                </View>
              </View>

              <Text style={styles.hero1RMValue}>
                {epley1RM} <Text style={styles.unitText}>KG</Text>
              </Text>
              <Text style={styles.basedOnText}>
                Based on best set: {bestWeight} kg × {bestReps} reps
              </Text>
            </View>

            {/* Formula Breakdown Cards */}
            <View style={styles.formulaRow}>
              <View style={styles.formulaCard}>
                <Text style={styles.formulaName}>Epley Formula</Text>
                <Text style={styles.formulaVal}>{epley1RM} kg</Text>
                <Text style={styles.formulaDesc}>Standard powerlifting</Text>
              </View>

              <View style={styles.formulaCard}>
                <Text style={styles.formulaName}>Brzycki Formula</Text>
                <Text style={styles.formulaVal}>{brzycki1RM} kg</Text>
                <Text style={styles.formulaDesc}>High-rep calibrated</Text>
              </View>
            </View>

            {/* Set Progression History Table */}
            <View style={styles.historyTableCard}>
              <Text style={styles.cardHeaderTitle}>Logged Sets History</Text>
              {allSets.length === 0 ? (
                <Text style={styles.noDataText}>No recorded sets for {selectedExercise} yet.</Text>
              ) : (
                allSets.map((s, idx) => (
                  <View key={idx} style={styles.historyRow}>
                    <Text style={styles.historyDate}>{s.date}</Text>
                    <Text style={styles.historySetDetails}>
                      {s.weight} kg × {s.reps} reps
                    </Text>
                    <Text style={styles.history1RM}>
                      1RM: <Text style={{ color: COLORS.primaryAccent, fontWeight: '800' }}>{s.est1RM} kg</Text>
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <>
            {/* Muscle Volume Breakdown */}
            <View style={styles.muscleCard}>
              <Text style={styles.cardHeaderTitle}>Weekly Muscle Volume Distribution</Text>
              <Text style={styles.muscleSubheader}>
                Total Load: {Math.round(totalDistVolume).toLocaleString()} kg
              </Text>

              <View style={styles.barsContainer}>
                {musclePercentages.map(({ muscle, vol, percent }) => (
                  <View key={muscle} style={styles.muscleBarItem}>
                    <View style={styles.muscleLabelRow}>
                      <Text style={styles.muscleName}>{muscle}</Text>
                      <Text style={styles.musclePercentText}>
                        {percent}% ({Math.round(vol).toLocaleString()} kg)
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${percent}%`,
                            backgroundColor:
                              muscle === 'Chest'
                                ? COLORS.primaryAccent
                                : muscle === 'Legs'
                                ? COLORS.secondaryAccent
                                : muscle === 'Back'
                                ? COLORS.success
                                : '#FF9500',
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
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
    gap: 16,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.primaryAccent,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.bgBase,
    fontWeight: '800',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  exerciseChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: COLORS.surfaceCard,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  chipActive: {
    borderColor: COLORS.primaryAccent,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.primaryAccent,
    fontWeight: '800',
  },
  heroProgressionCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    gap: 10,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  exerciseCardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  prSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.secondaryAccent,
  },
  hero1RMValue: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  unitText: {
    fontSize: 16,
    color: COLORS.primaryAccent,
    fontWeight: '800',
  },
  basedOnText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  formulaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formulaCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceCard,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  formulaName: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  formulaVal: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  formulaDesc: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  historyTableCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    gap: 10,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  noDataText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDark,
  },
  historyDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  historySetDetails: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  history1RM: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  muscleCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    gap: 14,
  },
  muscleSubheader: {
    fontSize: 13,
    color: COLORS.primaryAccent,
    fontWeight: '700',
  },
  barsContainer: {
    gap: 14,
  },
  muscleBarItem: {
    gap: 6,
  },
  muscleLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  muscleName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  musclePercentText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  barTrack: {
    height: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
});
