import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { COLORS } from '../theme/colors';
import { GroupedSetTable } from '../components/GroupedSetTable';
import { RestTimerBar } from '../components/RestTimerBar';
import { PushToTalkFab } from '../components/PushToTalkFab';
import { CANONICAL_EXERCISES } from '../models/exercises';
import { contextualWorkoutParser } from '../services/parser/contextualParser';
import { HapticsService } from '../services/audio/haptics';
import { AudioSessionManager } from '../services/audio/audioSessionManager';
import { useKeepAwake } from 'expo-keep-awake';
import { useWorkout } from '../context/WorkoutContext';
import { useRestTimer } from '../context/RestTimerContext';
import { ArrowLeft, CheckCircle, Sparkles, Plus, Dumbbell } from 'lucide-react-native';

interface LiveWorkoutScreenProps {
  onFinish: () => void;
  onBack: () => void;
}

export const LiveWorkoutScreen: React.FC<LiveWorkoutScreenProps> = ({ onFinish, onBack }) => {
  useKeepAwake();

  const {
    activeSession,
    activeExercise,
    targetSets,
    defaultUnit,
    lastFeedback,
    startLiveWorkout,
    finishActiveWorkout,
    cancelActiveWorkout,
    setActiveExercise,
    logSet,
    updateLastWeight,
    updateLastReps,
    deleteLastSet,
    getActiveContext,
  } = useWorkout();

  const {
    isTimerActive,
    timerTargetEnd,
    restTimerDuration,
    stopRestTimer,
    addTimerSeconds,
  } = useRestTimer();

  useEffect(() => {
    // Pre-warm audio session for instant voice input & Bluetooth routing
    AudioSessionManager.prewarm();
    if (!activeSession) {
      startLiveWorkout();
    }
  }, [activeSession, startLiveWorkout]);

  // Process Voice Command or Text Shortcut
  const handleVoiceCommand = (transcript: string) => {
    const context = getActiveContext();
    const command = contextualWorkoutParser.parse(transcript, context, defaultUnit);

    switch (command.type) {
      case 'LOG_SET': {
        logSet(command.exercise, command.weight, command.unit, command.reps);
        break;
      }

      case 'SET_ACTIVE_EXERCISE': {
        setActiveExercise(command.exercise, command.targetSets);
        break;
      }

      case 'UPDATE_LAST_WEIGHT': {
        updateLastWeight(command.newWeight);
        break;
      }

      case 'UPDATE_LAST_REPS': {
        updateLastReps(command.newReps);
        break;
      }

      case 'DELETE_LAST_SET': {
        deleteLastSet();
        break;
      }

      case 'FINISH_WORKOUT': {
        handleFinishWorkout();
        break;
      }

      case 'BATCH_SETS': {
        for (const item of command.exercises) {
          for (const s of item.sets) {
            logSet(item.exercise, s.weight, s.unit, s.reps);
          }
        }
        break;
      }

      case 'UNKNOWN':
      default: {
        HapticsService.deleteWarning();
        Alert.alert('Voice Command', `Could not parse: "${transcript}". Try saying "Bench press 80 kg for 10" or "same as last".`);
        break;
      }
    }
  };

  const handleFinishWorkout = () => {
    const session = activeSession;
    if (!session || session.groups.length === 0) {
      Alert.alert('Empty Workout', 'No sets have been logged yet.', [
        { text: 'Discard', style: 'destructive', onPress: () => { cancelActiveWorkout(); onBack(); } },
        { text: 'Continue Lifting', style: 'cancel' },
      ]);
      return;
    }

    Alert.alert('Finish Workout', 'Save this workout session to your history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save & Finish',
        style: 'default',
        onPress: async () => {
          await finishActiveWorkout();
          onFinish();
        },
      },
    ]);
  };

  const currentGroup = activeSession?.groups.find(
    g => g.exerciseName.toLowerCase() === activeExercise.toLowerCase()
  );
  const currentSetsCount = currentGroup?.sets.length || 0;

  // Calculate volume & sets for current active session
  const totalSets = activeSession?.groups.reduce((acc, g) => acc + g.sets.length, 0) || 0;
  const totalVol =
    activeSession?.groups.reduce((acc, g) => {
      return acc + g.sets.reduce((setAcc, set) => setAcc + set.weightValue * set.reps, 0);
    }, 0) || 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            HapticsService.lightTap();
            onBack();
          }}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>LIVE WORKOUT</Text>
          <Text style={styles.headerSubtitle}>
            {totalSets} Sets · {Math.round(totalVol)} {defaultUnit} Volume
          </Text>
        </View>

        <TouchableOpacity
          style={styles.finishButton}
          onPress={handleFinishWorkout}
          activeOpacity={0.8}
        >
          <CheckCircle size={16} color={COLORS.secondaryAccent} />
          <Text style={styles.finishButtonText}>FINISH</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Active Exercise Context Header */}
        <View style={styles.activeExerciseCard}>
          <View style={styles.cardTopRow}>
            <View style={styles.exerciseBadge}>
              <Dumbbell size={14} color={COLORS.primaryAccent} />
              <Text style={styles.exerciseBadgeText}>ACTIVE EXERCISE</Text>
            </View>
            <Text style={styles.progressPill}>
              Set {currentSetsCount + 1} of {targetSets}
            </Text>
          </View>

          <Text style={styles.activeExerciseTitle}>{activeExercise}</Text>

          {/* Target Sets Selector */}
          <View style={styles.targetSetsRow}>
            <Text style={styles.targetLabel}>Target Sets:</Text>
            {[3, 4, 5, 6].map(num => (
              <TouchableOpacity
                key={num}
                style={[
                  styles.targetChip,
                  targetSets === num && styles.targetChipSelected,
                ]}
                onPress={() => {
                  HapticsService.lightTap();
                  setActiveExercise(activeExercise, num);
                }}
              >
                <Text
                  style={[
                    styles.targetChipText,
                    targetSets === num && styles.targetChipTextSelected,
                  ]}
                >
                  {num} Sets
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Smart Voice Feedback & Prompt Banner */}
        <View style={styles.feedbackBanner}>
          <Sparkles size={16} color={COLORS.secondaryAccent} />
          <Text style={styles.feedbackText}>{lastFeedback}</Text>
        </View>

        {/* Quick Exercise Selector Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.exerciseChipsScroll}
        >
          {CANONICAL_EXERCISES.slice(0, 10).map(ex => {
            const isCurrent = ex.name.toLowerCase() === activeExercise.toLowerCase();
            return (
              <TouchableOpacity
                key={ex.name}
                style={[
                  styles.exerciseChip,
                  isCurrent && styles.exerciseChipActive,
                ]}
                onPress={() => {
                  HapticsService.lightTap();
                  setActiveExercise(ex.name);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.exerciseChipText,
                    isCurrent && styles.exerciseChipTextActive,
                  ]}
                >
                  {ex.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Grouped Sets Table */}
        <GroupedSetTable
          groups={activeSession?.groups || []}
          activeExerciseName={activeExercise}
          onUpdateSet={(setId: string, newWeight: number, newReps: number) => {
            updateLastWeight(newWeight);
            updateLastReps(newReps);
          }}
          onDeleteSet={(setId: string) => {
            deleteLastSet();
          }}
          onSelectExercise={(exName: string) => {
            setActiveExercise(exName);
          }}
        />
      </ScrollView>

      {/* Auto Rest Timer Bar */}
      {isTimerActive && (
        <RestTimerBar
          targetEndTime={timerTargetEnd}
          isActive={isTimerActive}
          totalDuration={restTimerDuration}
          onTimerComplete={stopRestTimer}
          onDismiss={stopRestTimer}
          onAddSeconds={addTimerSeconds}
        />
      )}

      {/* Floating Center-Docked Push-to-Talk Mic FAB */}
      <PushToTalkFab
        onVoiceCommand={handleVoiceCommand}
        isListening={false}
        sessionId={activeSession?.id || 'live_session'}
        exerciseContext={CANONICAL_EXERCISES.map((e) => e.name)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDark,
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceCard,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 255, 0, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  finishButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.secondaryAccent,
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 24,
  },
  activeExerciseCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  exerciseBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.primaryAccent,
    letterSpacing: 0.8,
  },
  progressPill: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondaryAccent,
  },
  activeExerciseTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },
  targetSetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  targetChip: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  targetChipSelected: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: COLORS.primaryAccent,
  },
  targetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  targetChipTextSelected: {
    color: COLORS.primaryAccent,
    fontWeight: '800',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 255, 0, 0.08)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.2)',
  },
  feedbackText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 16,
  },
  exerciseChipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  exerciseChip: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  exerciseChipActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: COLORS.primaryAccent,
  },
  exerciseChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  exerciseChipTextActive: {
    color: COLORS.primaryAccent,
    fontWeight: '800',
  },
});
