import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const HapticsService = {
  // Light tap for UI button presses
  lightTap: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignored if device doesn't support
    }
  },

  // Medium impact for primary actions / mode triggers
  mediumImpact: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Fallback
    }
  },

  // Medium vibration when a set is successfully logged
  setLoggedSuccess: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Fallback
    }
  },

  // Heavy tick for timer alert / warning
  timerAlert: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Fallback
    }
  },

  // Error/Delete vibration
  deleteWarning: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Fallback
    }
  },
};
