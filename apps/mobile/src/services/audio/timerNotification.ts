import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set notification handler so notifications display even if the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let channelConfigured = false;
let activeNotificationId: string | null = null;

export const TimerNotificationService = {
  /**
   * Initializes notification channels (Android) and requests permissions
   */
  init: async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return false;

      if (Platform.OS === 'android' && !channelConfigured) {
        await Notifications.setNotificationChannelAsync('rest_timer_channel', {
          name: 'Rest Timer Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 200, 500],
          enableVibrate: true,
          sound: 'default',
        });
        channelConfigured = true;
      }

      return true;
    } catch (e) {
      console.warn('[TimerNotificationService] Init error:', e);
      return false;
    }
  },

  /**
   * Schedules a high-priority alarm notification when the rest timer ends
   */
  scheduleTimerAlarm: async (secondsRemaining: number): Promise<string | null> => {
    if (Platform.OS === 'web' || secondsRemaining <= 0) return null;

    try {
      // Cancel any previous notification
      await TimerNotificationService.cancelTimerAlarm();

      await TimerNotificationService.init();

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚡ Rest Finished!',
          body: 'Time to crush your next set.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 500, 200, 500],
          data: { type: 'rest_timer_done' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.floor(secondsRemaining)),
          repeats: false,
        },
      });

      activeNotificationId = id;
      return id;
    } catch (err) {
      console.warn('[TimerNotificationService] Schedule error:', err);
      return null;
    }
  },

  /**
   * Cancels any pending scheduled rest timer notification
   */
  cancelTimerAlarm: async (): Promise<void> => {
    if (Platform.OS === 'web') return;

    try {
      if (activeNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(activeNotificationId);
        activeNotificationId = null;
      }
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}
  },
};
