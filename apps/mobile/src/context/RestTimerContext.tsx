import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PreferencesService } from '../services/storage/preferences';
import { TimerNotificationService } from '../services/audio/timerNotification';

interface RestTimerContextType {
  isTimerActive: boolean;
  timerTargetEnd: number | null;
  restTimerDuration: number;
  startRestTimer: (customSeconds?: number) => void;
  stopRestTimer: () => void;
  addTimerSeconds: (seconds: number) => void;
}

const RestTimerContext = createContext<RestTimerContextType | undefined>(undefined);

export const RestTimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [restTimerDuration, setRestTimerDuration] = useState<number>(60);
  const [isTimerActive, setIsTimerActive] = useState<boolean>(false);
  const [timerTargetEnd, setTimerTargetEnd] = useState<number | null>(null);

  useEffect(() => {
    const loadDuration = async () => {
      const duration = await PreferencesService.getRestTimerDuration();
      setRestTimerDuration(duration);
      TimerNotificationService.init();
    };
    loadDuration();
  }, []);

  const startRestTimer = useCallback((customSeconds?: number) => {
    const duration = customSeconds || restTimerDuration;
    const targetEnd = Date.now() + duration * 1000;
    setTimerTargetEnd(targetEnd);
    setIsTimerActive(true);
    TimerNotificationService.scheduleTimerAlarm(duration);
  }, [restTimerDuration]);

  const stopRestTimer = useCallback(() => {
    setIsTimerActive(false);
    setTimerTargetEnd(null);
    TimerNotificationService.cancelTimerAlarm();
  }, []);

  const addTimerSeconds = useCallback((seconds: number) => {
    setTimerTargetEnd(prev => {
      const base = prev && prev > Date.now() ? prev : Date.now();
      const updated = base + seconds * 1000;
      const remainingSeconds = Math.max(1, (updated - Date.now()) / 1000);
      TimerNotificationService.scheduleTimerAlarm(remainingSeconds);
      return updated;
    });
    setIsTimerActive(true);
  }, []);

  return (
    <RestTimerContext.Provider
      value={{
        isTimerActive,
        timerTargetEnd,
        restTimerDuration,
        startRestTimer,
        stopRestTimer,
        addTimerSeconds,
      }}
    >
      {children}
    </RestTimerContext.Provider>
  );
};

export const useRestTimer = (): RestTimerContextType => {
  const context = useContext(RestTimerContext);
  if (!context) {
    throw new Error('useRestTimer must be used within a RestTimerProvider');
  }
  return context;
};
