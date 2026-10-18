import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { WorkoutSession, WorkoutGroup, WorkoutSet, WeightUnit } from '../models/workout';
import { DatabaseService } from '../services/storage/database';
import { PreferencesService } from '../services/storage/preferences';
import { HapticsService } from '../services/audio/haptics';
import { SpeechReceiptsService } from '../services/audio/speechReceipts';
import { ActiveContextState } from '../services/parser/contextualParser';
import { useRestTimer } from './RestTimerContext';

interface WorkoutContextType {
  activeSession: WorkoutSession | null;
  activeExercise: string;
  targetSets: number;
  defaultUnit: WeightUnit;
  lastFeedback: string;
  dataVersion: number;
  notifyDataChanged: () => void;
  startLiveWorkout: () => void;
  startBatchWorkout: () => void;
  finishActiveWorkout: () => Promise<void>;
  cancelActiveWorkout: () => void;
  setActiveExercise: (exercise: string, targetSets?: number) => void;
  logSet: (exercise: string, weight: number, unit: WeightUnit, reps: number) => void;
  updateLastWeight: (newWeight: number) => void;
  updateLastReps: (newReps: number) => void;
  deleteLastSet: () => void;
  getActiveContext: () => ActiveContextState;
  // Proxied timer helpers for convenience
  isTimerActive: boolean;
  timerTargetEnd: number | null;
  restTimerDuration: number;
  startRestTimer: (customSeconds?: number) => void;
  stopRestTimer: () => void;
  addTimerSeconds: (seconds: number) => void;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

export const WorkoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    isTimerActive,
    timerTargetEnd,
    restTimerDuration,
    startRestTimer,
    stopRestTimer,
    addTimerSeconds,
  } = useRestTimer();

  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [activeExercise, setActiveExerciseState] = useState<string>('Bench Press');
  const [targetSets, setTargetSets] = useState<number>(4);
  const [defaultUnit, setDefaultUnit] = useState<WeightUnit>('kg');
  const [lastFeedback, setLastFeedback] = useState<string>(
    'Active: Bench Press · Say "80 kg for 10" or "same as last"'
  );
  const [dataVersion, setDataVersion] = useState<number>(1);

  const notifyDataChanged = useCallback(() => {
    setDataVersion(prev => prev + 1);
  }, []);

  useEffect(() => {
    const loadPreferences = async () => {
      const unit = await PreferencesService.getDefaultUnit();
      setDefaultUnit(unit);
    };
    loadPreferences();
  }, []);

  const startLiveWorkout = useCallback(() => {
    HapticsService.mediumImpact();
    const newSession: WorkoutSession = {
      id: 'live_' + Date.now(),
      userId: 'usr_local',
      workoutDate: new Date().toISOString().split('T')[0],
      startedAt: Date.now(),
      mode: 'LIVE',
      groups: [],
      isSynced: false,
    };
    setActiveSession(newSession);
    setActiveExerciseState('Bench Press');
    setTargetSets(4);
    stopRestTimer();
    setLastFeedback('Active: Bench Press · Say "80 kg for 10" or "same as last"');
  }, [stopRestTimer]);

  const startBatchWorkout = useCallback(() => {
    HapticsService.mediumImpact();
    const newSession: WorkoutSession = {
      id: 'batch_' + Date.now(),
      userId: 'usr_local',
      workoutDate: new Date().toISOString().split('T')[0],
      startedAt: Date.now(),
      mode: 'BATCH',
      groups: [],
      isSynced: false,
    };
    setActiveSession(newSession);
    stopRestTimer();
  }, [stopRestTimer]);

  const getActiveContext = useCallback((): ActiveContextState => {
    if (!activeSession) {
      return {
        exerciseName: activeExercise,
        lastUnit: defaultUnit,
      };
    }
    const currentGroup = activeSession.groups.find(
      g => g.exerciseName.toLowerCase() === activeExercise.toLowerCase()
    );
    const lastSet = currentGroup?.sets[currentGroup.sets.length - 1];
    return {
      exerciseName: activeExercise,
      lastWeight: lastSet?.weightValue,
      lastUnit: lastSet?.weightUnit || defaultUnit,
      lastReps: lastSet?.reps,
    };
  }, [activeSession, activeExercise, defaultUnit]);

  const setActiveExercise = useCallback((exercise: string, sets?: number) => {
    setActiveExerciseState(exercise);
    if (sets) setTargetSets(sets);
    HapticsService.lightTap();
    SpeechReceiptsService.speakMessage(`Switched to ${exercise}`);
    setLastFeedback(`Switched context to ${exercise}`);
  }, []);

  const logSet = useCallback(
    (exercise: string, weight: number, unit: WeightUnit, reps: number) => {
      setActiveSession(prev => {
        const currentSession = prev || {
          id: 'live_' + Date.now(),
          userId: 'usr_local',
          workoutDate: new Date().toISOString().split('T')[0],
          startedAt: Date.now(),
          mode: 'LIVE' as const,
          groups: [],
          isSynced: false,
        };

        const newSet: WorkoutSet = {
          id: 'set_' + Date.now(),
          groupId: '',
          sessionId: currentSession.id,
          setIndex: 1,
          exerciseName: exercise,
          weightValue: weight,
          weightUnit: unit,
          reps: reps,
          createdAt: Date.now(),
        };

        const updatedGroups = [...currentSession.groups];
        const groupIdx = updatedGroups.findIndex(
          g => g.exerciseName.toLowerCase() === exercise.toLowerCase()
        );

        if (groupIdx >= 0) {
          const grp = updatedGroups[groupIdx];
          newSet.groupId = grp.id;
          newSet.setIndex = grp.sets.length + 1;
          updatedGroups[groupIdx] = {
            ...grp,
            sets: [...grp.sets, newSet],
          };
        } else {
          const newGroupId = 'grp_' + Date.now();
          newSet.groupId = newGroupId;
          newSet.setIndex = 1;
          updatedGroups.push({
            id: newGroupId,
            sessionId: currentSession.id,
            exerciseName: exercise,
            targetSets: targetSets,
            sets: [newSet],
            createdAt: Date.now(),
          });
        }

        return { ...currentSession, groups: updatedGroups };
      });

      setActiveExerciseState(exercise);
      startRestTimer();
      HapticsService.setLoggedSuccess();
      SpeechReceiptsService.speakLoggedSet(exercise, weight, unit, reps);
      setLastFeedback(`Logged: ${exercise} · ${weight}${unit} × ${reps}`);
    },
    [targetSets, startRestTimer]
  );

  const updateLastWeight = useCallback(
    (newWeight: number) => {
      setActiveSession(prev => {
        if (!prev) return null;
        const updatedGroups = [...prev.groups];
        const groupIdx = updatedGroups.findIndex(
          g => g.exerciseName.toLowerCase() === activeExercise.toLowerCase()
        );
        if (groupIdx >= 0 && updatedGroups[groupIdx].sets.length > 0) {
          const sets = [...updatedGroups[groupIdx].sets];
          const lastIdx = sets.length - 1;
          sets[lastIdx] = { ...sets[lastIdx], weightValue: newWeight, isCorrected: true };
          updatedGroups[groupIdx] = { ...updatedGroups[groupIdx], sets };
          HapticsService.lightTap();
          SpeechReceiptsService.speakMessage(`Weight updated to ${newWeight}`);
          setLastFeedback(`Updated: ${activeExercise} weight to ${newWeight}`);
          return { ...prev, groups: updatedGroups };
        }
        return prev;
      });
    },
    [activeExercise]
  );

  const updateLastReps = useCallback(
    (newReps: number) => {
      setActiveSession(prev => {
        if (!prev) return null;
        const updatedGroups = [...prev.groups];
        const groupIdx = updatedGroups.findIndex(
          g => g.exerciseName.toLowerCase() === activeExercise.toLowerCase()
        );
        if (groupIdx >= 0 && updatedGroups[groupIdx].sets.length > 0) {
          const sets = [...updatedGroups[groupIdx].sets];
          const lastIdx = sets.length - 1;
          sets[lastIdx] = { ...sets[lastIdx], reps: newReps, isCorrected: true };
          updatedGroups[groupIdx] = { ...updatedGroups[groupIdx], sets };
          HapticsService.lightTap();
          SpeechReceiptsService.speakMessage(`Reps updated to ${newReps}`);
          setLastFeedback(`Updated: ${activeExercise} reps to ${newReps}`);
          return { ...prev, groups: updatedGroups };
        }
        return prev;
      });
    },
    [activeExercise]
  );

  const deleteLastSet = useCallback(() => {
    setActiveSession(prev => {
      if (!prev) return null;
      const updatedGroups = [...prev.groups];
      const groupIdx = updatedGroups.findIndex(
        g => g.exerciseName.toLowerCase() === activeExercise.toLowerCase()
      );
      if (groupIdx >= 0 && updatedGroups[groupIdx].sets.length > 0) {
        const sets = [...updatedGroups[groupIdx].sets];
        sets.pop();
        if (sets.length === 0) {
          updatedGroups.splice(groupIdx, 1);
        } else {
          updatedGroups[groupIdx] = { ...updatedGroups[groupIdx], sets };
        }
        HapticsService.deleteWarning();
        SpeechReceiptsService.speakMessage('Last set removed');
        setLastFeedback('Deleted last set');
        return { ...prev, groups: updatedGroups };
      }
      return prev;
    });
  }, [activeExercise]);

  const finishActiveWorkout = useCallback(async () => {
    if (activeSession && activeSession.groups.length > 0) {
      const completed: WorkoutSession = {
        ...activeSession,
        finishedAt: Date.now(),
      };
      await DatabaseService.saveSession(completed);
      setDataVersion(prev => prev + 1);
      HapticsService.setLoggedSuccess();
      SpeechReceiptsService.speakMessage('Workout completed and saved');
    }
    setActiveSession(null);
    stopRestTimer();
  }, [activeSession, stopRestTimer]);

  const cancelActiveWorkout = useCallback(() => {
    setActiveSession(null);
    stopRestTimer();
  }, [stopRestTimer]);

  return (
    <WorkoutContext.Provider
      value={{
        activeSession,
        activeExercise,
        targetSets,
        defaultUnit,
        lastFeedback,
        dataVersion,
        notifyDataChanged,
        startLiveWorkout,
        startBatchWorkout,
        finishActiveWorkout,
        cancelActiveWorkout,
        setActiveExercise,
        logSet,
        updateLastWeight,
        updateLastReps,
        deleteLastSet,
        getActiveContext,
        isTimerActive,
        timerTargetEnd,
        restTimerDuration,
        startRestTimer,
        stopRestTimer,
        addTimerSeconds,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
};

export const useWorkout = (): WorkoutContextType => {
  const context = useContext(WorkoutContext);
  if (!context) {
    throw new Error('useWorkout must be used within a WorkoutProvider');
  }
  return context;
};
