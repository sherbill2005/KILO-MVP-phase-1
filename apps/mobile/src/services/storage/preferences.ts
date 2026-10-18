import AsyncStorage from '@react-native-async-storage/async-storage';
import { WeightUnit } from '../../models/workout';

const KEYS = {
  TTS_ENABLED: '@kilo_pref_tts_enabled',
  DEFAULT_UNIT: '@kilo_pref_default_unit',
  REST_TIMER_DURATION: '@kilo_pref_rest_timer_sec',
  USER_DISPLAY_NAME: '@kilo_user_name',
  USER_EMAIL: '@kilo_user_email',
};

export const PreferencesService = {
  getTtsEnabled: async (): Promise<boolean> => {
    try {
      const val = await AsyncStorage.getItem(KEYS.TTS_ENABLED);
      return val !== null ? JSON.parse(val) : true; // Default ON
    } catch {
      return true;
    }
  },

  setTtsEnabled: async (enabled: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.TTS_ENABLED, JSON.stringify(enabled));
    } catch {
      // Ignored
    }
  },

  getDefaultUnit: async (): Promise<WeightUnit> => {
    try {
      const val = await AsyncStorage.getItem(KEYS.DEFAULT_UNIT);
      return (val === 'lb' ? 'lb' : 'kg') as WeightUnit;
    } catch {
      return 'kg';
    }
  },

  setDefaultUnit: async (unit: WeightUnit): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.DEFAULT_UNIT, unit);
    } catch {
      // Ignored
    }
  },

  getRestTimerDuration: async (): Promise<number> => {
    try {
      const val = await AsyncStorage.getItem(KEYS.REST_TIMER_DURATION);
      return val ? parseInt(val, 10) : 60; // Default 60 seconds
    } catch {
      return 60;
    }
  },

  setRestTimerDuration: async (seconds: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.REST_TIMER_DURATION, seconds.toString());
    } catch {
      // Ignored
    }
  },

  getUserProfile: async () => {
    try {
      const name = await AsyncStorage.getItem(KEYS.USER_DISPLAY_NAME);
      const email = await AsyncStorage.getItem(KEYS.USER_EMAIL);
      return {
        displayName: name || 'Lifter',
        email: email || 'lifter@kilo.app',
      };
    } catch {
      return { displayName: 'Lifter', email: 'lifter@kilo.app' };
    }
  },

  setUserProfile: async (name: string, email: string) => {
    try {
      await AsyncStorage.setItem(KEYS.USER_DISPLAY_NAME, name);
      await AsyncStorage.setItem(KEYS.USER_EMAIL, email);
    } catch {
      // Ignored
    }
  },
};
