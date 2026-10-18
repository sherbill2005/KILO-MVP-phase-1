import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
} from 'react-native';
import { COLORS } from '../theme/colors';
import { GroupedSetTable } from '../components/GroupedSetTable';
import { PushToTalkFab } from '../components/PushToTalkFab';
import { WorkoutSession, WorkoutGroup, WorkoutSet, WeightUnit } from '../models/workout';
import { contextualWorkoutParser } from '../services/parser/contextualParser';
import { DatabaseService } from '../services/storage/database';
import { HapticsService } from '../services/audio/haptics';
import { SpeechReceiptsService } from '../services/audio/speechReceipts';
import { useWorkout } from '../context/WorkoutContext';
import { AudioSessionManager } from '../services/audio/audioSessionManager';
import { ArrowLeft, Sparkles, Check, Trash2, Mic, Dumbbell } from 'lucide-react-native';

interface BatchWorkoutScreenProps {
  onFinish: () => void;
  onBack: () => void;
}

export const BatchWorkoutScreen: React.FC<BatchWorkoutScreenProps> = ({ onFinish, onBack }) => {
  const { notifyDataChanged } = useWorkout();
  const [transcript, setTranscript] = useState('');
  const [parsedGroups, setParsedGroups] = useState<WorkoutGroup[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  React.useEffect(() => {
    AudioSessionManager.prewarm();
  }, []);

  const handleVoiceInput = (text: string) => {
    setTranscript(text);
    processBatchText(text);
  };

  const processBatchText = (text: string) => {
    if (!text.trim()) return;
    setIsProcessing(true);
    HapticsService.lightTap();

    const results = contextualWorkoutParser.parseBatch(text, 'kg');
    const sessionId = 'batch_' + Date.now();

    const groups: WorkoutGroup[] = results.map((item, gIdx) => {
      const groupId = `grp_${Date.now()}_${gIdx}`;
      return {
        id: groupId,
        sessionId,
        exerciseName: item.exercise,
        targetSets: item.sets.length,
        createdAt: Date.now(),
        sets: item.sets.map((s, sIdx) => ({
          id: `set_${Date.now()}_${gIdx}_${sIdx}`,
          groupId,
          sessionId,
          setIndex: sIdx + 1,
          exerciseName: item.exercise,
          weightValue: s.weight,
          weightUnit: s.unit,
          reps: s.reps,
          createdAt: Date.now(),
        })),
      };
    });

    setParsedGroups(groups);
    setIsProcessing(false);

    if (groups.length > 0) {
      HapticsService.setLoggedSuccess();
      SpeechReceiptsService.speakMessage(`Extracted ${groups.length} exercises`);
    } else {
      HapticsService.deleteWarning();
    }
  };

  const handleUpdateSet = (setId: string, newWeight: number, newReps: number) => {
    setParsedGroups(prev =>
      prev.map(group => ({
        ...group,
        sets: group.sets.map(s =>
          s.id === setId ? { ...s, weightValue: newWeight, reps: newReps, isCorrected: true } : s
        ),
      }))
    );
  };

  const handleDeleteSet = (setId: string) => {
    setParsedGroups(prev =>
      prev
        .map(group => ({
          ...group,
          sets: group.sets.filter(s => s.id !== setId),
        }))
        .filter(group => group.sets.length > 0)
    );
  };

  const handleConfirmSave = async () => {
    if (parsedGroups.length === 0) {
      Alert.alert('No Workout Data', 'Please speak or enter your workout routine first.');
      return;
    }

    HapticsService.setLoggedSuccess();
    const session: WorkoutSession = {
      id: 'batch_' + Date.now(),
      userId: 'usr_local',
      workoutDate: new Date().toISOString().split('T')[0],
      startedAt: Date.now() - 3600000, // 1 hour ago
      finishedAt: Date.now(),
      mode: 'BATCH',
      groups: parsedGroups,
      isSynced: false,
    };

    await DatabaseService.saveSession(session);
    notifyDataChanged();
    SpeechReceiptsService.speakMessage('Batch workout saved successfully');
    onFinish();
  };

  const PRESET_EXAMPLES = [
    'Bench press 3 sets of 10 at 80 kg, then Squat 100 kg for 5 reps',
    'Deadlift 140 kg 5 reps, 150 kg 3 reps, then Bicep curl 15 kg 12 reps',
    'Incline bench press 70 kg 8 reps, Lat pulldown 60 kg 10 reps',
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>LOG WHOLE WORKOUT</Text>
          <Text style={styles.headerSubtitle}>Batch Multi-Exercise Voice Ingestion</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Banner Instruction Card */}
        <View style={styles.instructionCard}>
          <View style={styles.instructionHeader}>
            <Sparkles size={18} color={COLORS.primaryAccent} />
            <Text style={styles.instructionTitle}>Speak Your Entire Routine</Text>
          </View>
          <Text style={styles.instructionText}>
            Hold the mic below or type a voice script. You can mention multiple exercises separated by "then" or commas.
          </Text>

          {/* Example chips */}
          <Text style={styles.examplesTitle}>Try an example:</Text>
          <View style={styles.examplesRow}>
            {PRESET_EXAMPLES.map((ex, i) => (
              <TouchableOpacity
                key={i}
                style={styles.exampleChip}
                onPress={() => handleVoiceInput(ex)}
                activeOpacity={0.7}
              >
                <Text style={styles.exampleChipText} numberOfLines={1}>
                  "{ex}"
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Live / Parsed Transcript Box */}
        {transcript ? (
          <View style={styles.transcriptCard}>
            <Text style={styles.transcriptHeader}>RECOGNIZED TRANSCRIPT</Text>
            <Text style={styles.transcriptText}>"{transcript}"</Text>
          </View>
        ) : null}

        {/* Preview of Extracted Groups */}
        <View style={styles.previewHeader}>
          <Text style={styles.sectionTitle}>EXTRACTED WORKOUT PREVIEW</Text>
          <Text style={styles.exerciseCountText}>
            {parsedGroups.length} Exercises · {parsedGroups.reduce((a, g) => a + g.sets.length, 0)} Sets
          </Text>
        </View>

        <GroupedSetTable
          groups={parsedGroups}
          onUpdateSet={handleUpdateSet}
          onDeleteSet={handleDeleteSet}
        />
      </ScrollView>

      {/* Bottom Action Dock */}
      <View style={styles.bottomDock}>
        {parsedGroups.length > 0 ? (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.discardButton}
              onPress={() => {
                HapticsService.deleteWarning();
                setParsedGroups([]);
                setTranscript('');
              }}
              activeOpacity={0.7}
            >
              <Trash2 size={16} color={COLORS.danger} />
              <Text style={styles.discardButtonText}>Discard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirmSave}
              activeOpacity={0.85}
            >
              <Check size={18} color={COLORS.bgBase} />
              <Text style={styles.confirmButtonText}>Confirm & Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.fabDock}>
            <PushToTalkFab onVoiceCommand={handleVoiceInput} />
            <Text style={styles.fabSubtext}>HOLD TO SPEAK WHOLE WORKOUT</Text>
          </View>
        )}
      </View>
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
    paddingBottom: 130,
    gap: 14,
  },
  instructionCard: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    gap: 10,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  instructionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  examplesTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  examplesRow: {
    gap: 6,
  },
  exampleChip: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  exampleChipText: {
    fontSize: 12,
    color: COLORS.primaryAccent,
    fontWeight: '500',
  },
  transcriptCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 6,
  },
  transcriptHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  transcriptText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.secondaryAccent,
    fontStyle: 'italic',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  exerciseCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(11, 14, 20, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderDark,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  discardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dangerBg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  discardButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.danger,
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondaryAccent,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.bgBase,
  },
  fabDock: {
    alignItems: 'center',
    gap: 6,
  },
  fabSubtext: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
  },
});
