import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { COLORS } from '../theme/colors';
import { Timer, Plus, Play, Pause, SkipForward } from 'lucide-react-native';
import { HapticsService } from '../services/audio/haptics';
import { SpeechReceiptsService } from '../services/audio/speechReceipts';

interface RestTimerBarProps {
  targetEndTime: number | null;
  isActive: boolean;
  totalDuration?: number;
  onTimerComplete?: () => void;
  onDismiss?: () => void;
  onAddSeconds?: (seconds: number) => void;
}

export const RestTimerBar: React.FC<RestTimerBarProps> = ({
  targetEndTime,
  isActive,
  totalDuration = 60,
  onTimerComplete,
  onDismiss,
  onAddSeconds,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedRemaining, setPausedRemaining] = useState<number>(0);
  const completedRef = useRef(false);

  // Synchronize remaining seconds using real timestamp delta
  const syncRemaining = useCallback(() => {
    if (isPaused) return;
    if (!targetEndTime || !isActive) {
      setTimeLeft(0);
      return;
    }

    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((targetEndTime - now) / 1000));
    setTimeLeft(remaining);

    if (remaining <= 0 && !completedRef.current) {
      completedRef.current = true;
      HapticsService.timerAlert();
      SpeechReceiptsService.speakTimerDone();
      onTimerComplete?.();
    }
  }, [targetEndTime, isActive, isPaused, onTimerComplete]);

  // Handle AppState changes (e.g. unlocking phone or returning from Spotify)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncRemaining();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncRemaining]);

  // Timer interval loop
  useEffect(() => {
    if (!isActive || isPaused || !targetEndTime) {
      completedRef.current = false;
      return;
    }

    syncRemaining();
    const interval = setInterval(() => {
      syncRemaining();
    }, 500);

    return () => clearInterval(interval);
  }, [isActive, isPaused, targetEndTime, syncRemaining]);

  if (!isActive || (timeLeft <= 0 && !isPaused)) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = totalDuration > 0 ? Math.min(100, (timeLeft / totalDuration) * 100) : 0;

  const handleAdd30 = () => {
    HapticsService.lightTap();
    onAddSeconds?.(30);
  };

  const handleTogglePause = () => {
    HapticsService.lightTap();
    if (!isPaused) {
      setPausedRemaining(timeLeft);
      setIsPaused(true);
    } else {
      setIsPaused(false);
    }
  };

  const handleSkip = () => {
    HapticsService.lightTap();
    onDismiss?.();
  };

  return (
    <View style={styles.container}>
      {/* Background progress indicator bar */}
      <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />

      <View style={styles.contentRow}>
        <View style={styles.timeSection}>
          <Timer size={18} color={COLORS.primaryAccent} />
          <Text style={styles.timerDigits}>{formatTime(timeLeft)}</Text>
          <Text style={styles.label}>{isPaused ? 'PAUSED' : 'REST TIMER'}</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleAdd30} activeOpacity={0.7}>
            <Plus size={14} color={COLORS.textPrimary} />
            <Text style={styles.btnText}>+30s</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleTogglePause} activeOpacity={0.7}>
            {isPaused ? (
              <Play size={14} color={COLORS.secondaryAccent} fill={COLORS.secondaryAccent} />
            ) : (
              <Pause size={14} color={COLORS.textPrimary} />
            )}
            <Text style={[styles.btnText, isPaused && { color: COLORS.secondaryAccent }]}>
              {isPaused ? 'Resume' : 'Pause'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
            <SkipForward size={14} color={COLORS.textSecondary} />
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    marginHorizontal: 16,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  timeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerDigits: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.primaryAccent,
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
