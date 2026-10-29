import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import type { AudioRecorder } from 'expo-audio';
import { COLORS } from '../theme/colors';
import { Mic, Keyboard, X, Send, Sparkles, Volume2 } from 'lucide-react-native';
import { HapticsService } from '../services/audio/haptics';
import { AudioClient } from '../services/audio/audioClient';

import { AudioSessionManager } from '../services/audio/audioSessionManager';

export interface StructuredWorkoutItem {
  exercise: string;
  sets: { weight: number; unit?: string; reps: number }[];
}

interface PushToTalkFabProps {
  onVoiceCommand: (transcript: string) => void;
  /** Receives the full AI-extracted workout (all exercises + sets). */
  onStructuredWorkout?: (workout: StructuredWorkoutItem[], transcript: string) => void;
  isListening?: boolean;
  disabled?: boolean;
  sessionId?: string;
  exerciseContext?: string[];
}

export const PushToTalkFab: React.FC<PushToTalkFabProps> = ({
  onVoiceCommand,
  onStructuredWorkout,
  isListening = false,
  disabled = false,
  sessionId = 'live_session',
  exerciseContext = [],
}) => {
  const [activeListening, setActiveListening] = useState(isListening);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [typedCommand, setTypedCommand] = useState('');
  const recordingRef = useRef<AudioRecorder | null>(null);
  const recordStartTimeRef = useRef<number>(0);

  // Pulsing animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  // Pre-warm audio on mount
  useEffect(() => {
    AudioSessionManager.prewarm();
  }, []);

  useEffect(() => {
    if (activeListening) {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.25,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0.9,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.0,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0.4,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      glowAnim.setValue(0.4);
    }
  }, [activeListening]);

  const handlePressIn = async () => {
    if (disabled || isProcessing) return;
    HapticsService.lightTap();

    try {
      if (Platform.OS !== 'web') {
        const recording = await AudioSessionManager.startInstantRecording();
        if (!recording) {
          setShowTextModal(true);
          return;
        }
        recordingRef.current = recording;
        recordStartTimeRef.current = Date.now();
      }
      setActiveListening(true);
    } catch (err) {
      console.warn('[Audio] Failed to start recording:', err);
      setActiveListening(true);
    }
  };

  const handlePressOut = async () => {
    if (disabled || !activeListening) return;
    setActiveListening(false);
    HapticsService.setLoggedSuccess();

    const duration = Date.now() - recordStartTimeRef.current;

    try {
      if (recordingRef.current) {
        const uri = await AudioSessionManager.stopRecording(recordingRef.current);
        recordingRef.current = null;

        // If held for less than 350ms, give a subtle haptic reminder instead of intruding with modal
        if (duration < 350) {
          HapticsService.lightTap();
          return;
        }

        // Processing recorded audio
        setIsProcessing(true);
        if (uri) {
          const res = await AudioClient.uploadAudioForParsing(uri, exerciseContext, sessionId);
          setIsProcessing(false);
          if (res.ok) {
            if (res.workout && res.workout.length > 0 && onStructuredWorkout) {
              HapticsService.setLoggedSuccess();
              onStructuredWorkout(res.workout, res.transcript || '');
              return;
            }
            if (res.workout && res.workout.length > 0) {
              HapticsService.setLoggedSuccess();
              const first = res.workout[0];
              const s = first.sets?.[0];
              if (s) {
                onVoiceCommand(`${first.exercise} ${s.weight} ${s.unit || 'kg'} for ${s.reps} reps`);
                return;
              }
            }
            if (res.transcript && res.transcript.trim()) {
              HapticsService.setLoggedSuccess();
              onVoiceCommand(res.transcript.trim());
              return;
            }
          } else {
            HapticsService.deleteWarning();
            setShowTextModal(true);
          }
        }
        setIsProcessing(false);
      }
    } catch (err) {
      console.warn('[Audio] Stop recording error:', err);
      setIsProcessing(false);
      HapticsService.deleteWarning();
    }
  };

  const handleSendTyped = (textToSend?: string) => {
    const text = textToSend || typedCommand;
    if (!text.trim()) return;
    HapticsService.setLoggedSuccess();
    onVoiceCommand(text.trim());
    setTypedCommand('');
    setShowTextModal(false);
  };

  const QUICK_SUGGESTIONS = [
    'Bench press 85 kg for 8 reps',
    'Squat 100 kg 5 reps',
    'Same weight, same reps',
    'Change weight to 90',
    'Delete last set',
    'Finish workout',
  ];

  return (
    <>
      <View style={styles.fabContainer}>
        {/* Animated Glow Ring */}
        {activeListening && (
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseAnim }],
                opacity: glowAnim,
              },
            ]}
          />
        )}

        {/* Outer Ring */}
        <View style={[styles.outerGlow, activeListening && styles.outerGlowActive]}>
          <TouchableOpacity
            style={[
              styles.fabButton,
              activeListening && styles.fabButtonActive,
              disabled && styles.fabButtonDisabled,
            ]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={0.9}
            disabled={disabled}
          >
            {isProcessing ? (
              <ActivityIndicator color={COLORS.bgBase} size="small" />
            ) : (
              <Mic
                size={30}
                color={activeListening ? COLORS.bgBase : COLORS.secondaryAccent}
                strokeWidth={2.5}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Micro-label */}
        <Text style={[styles.fabLabel, activeListening && styles.fabLabelActive]}>
          {activeListening ? 'RELEASE TO LOG' : isProcessing ? 'PROCESSING...' : 'HOLD TO LOG'}
        </Text>

        {/* Keyboard Fallback Button */}
        <TouchableOpacity
          style={styles.keyboardShortcutBtn}
          onPress={() => {
            HapticsService.lightTap();
            setShowTextModal(true);
          }}
          activeOpacity={0.7}
        >
          <Keyboard size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Manual Voice/Text Shortcut Modal */}
      <Modal
        visible={showTextModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTextModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Sparkles size={18} color={COLORS.secondaryAccent} />
                <Text style={styles.modalTitle}>Voice Command & Shortcuts</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowTextModal(false)}
                style={styles.closeBtn}
                activeOpacity={0.7}
              >
                <X size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Tap a quick gym shortcut or type your custom set command:
            </Text>

            {/* Quick Suggestions Chips */}
            <View style={styles.suggestionsContainer}>
              {QUICK_SUGGESTIONS.map((sug, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.suggestionChip}
                  onPress={() => handleSendTyped(sug)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionText}>{sug}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input Bar */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder='e.g. "80 for 10" or "same as last"'
                placeholderTextColor={COLORS.textMuted}
                value={typedCommand}
                onChangeText={setTypedCommand}
                onSubmitEditing={() => handleSendTyped()}
                returnKeyType="send"
                autoFocus
              />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  !typedCommand.trim() && styles.sendBtnDisabled,
                ]}
                onPress={() => handleSendTyped()}
                disabled={!typedCommand.trim()}
                activeOpacity={0.8}
              >
                <Send
                  size={16}
                  color={typedCommand.trim() ? COLORS.bgBase : COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.secondaryAccent,
  },
  outerGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(212, 255, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.25)',
  },
  outerGlowActive: {
    backgroundColor: 'rgba(212, 255, 0, 0.2)',
    borderColor: COLORS.secondaryAccent,
  },
  fabButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 2,
    borderColor: COLORS.secondaryAccent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: COLORS.secondaryAccent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  fabButtonActive: {
    backgroundColor: COLORS.secondaryAccent,
    transform: [{ scale: 0.96 }],
  },
  fabButtonDisabled: {
    opacity: 0.5,
  },
  fabLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
    marginTop: 8,
  },
  fabLabelActive: {
    color: COLORS.secondaryAccent,
  },
  keyboardShortcutBtn: {
    position: 'absolute',
    right: 32,
    bottom: 12,
    padding: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surfaceCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    marginTop: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 10,
  },
  sendBtn: {
    backgroundColor: COLORS.secondaryAccent,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.borderDark,
  },
});
