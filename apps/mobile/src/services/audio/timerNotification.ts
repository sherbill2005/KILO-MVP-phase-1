import { Platform } from 'react-native';
import { HapticsService } from './haptics';
import { SpeechReceiptsService } from './speechReceipts';

// Dynamically and safely resolve expo-notifications without crashing when native bindings are missing
let NotificationsModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-notifications');
  if (mod && mod.setNotificationHandler) {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    NotificationsModule = mod;
  }
} catch (err) {
  console.log('[TimerNotificationService] Running without native expo-notifications (fallback mode active)');
}

let channelConfigured = false;
let activeNotificationId: string | null = null;
let fallbackTimerId: NodeJS.Timeout | null = null;

export const TimerNotificationService = {
  /**
   * Initializes notification channels (Android) and requests permissions
   */
  init: async (): Promise<boolean> => {
    if (Platform.OS === 'web' || !NotificationsModule) return false;

    try {
      const { status: existingStatus } = await NotificationsModule.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await NotificationsModule.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') return false;

      if (Platform.OS === 'android' && !channelConfigured) {
        await NotificationsModule.setNotificationChannelAsync('rest_timer_channel', {
          name: 'Rest Timer Alerts',
          importance: NotificationsModule.AndroidImportance.MAX,
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
   * Schedules a high-priority alarm notification when the rest timer ends,
   * with automatic speech & haptics fallback when native notifications are unavailable.
   */
  scheduleTimerAlarm: async (secondsRemaining: number): Promise<string | null> => {
    if (secondsRemaining <= 0) return null;

    try {
      // Cancel any existing alarm or fallback timer
      await TimerNotificationService.cancelTimerAlarm();

      if (NotificationsModule) {
        await TimerNotificationService.init();

        const id = await NotificationsModule.scheduleNotificationAsync({
          content: {
            title: '⚡ Rest Finished!',
            body: 'Time to crush your next set.',
            sound: true,
            priority: NotificationsModule.AndroidNotificationPriority.MAX,
            vibrate: [0, 500, 200, 500],
            data: { type: 'rest_timer_done' },
          },
          trigger: {
            type: NotificationsModule.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: Math.max(1, Math.floor(secondsRemaining)),
            repeats: false,
          },
        });

        activeNotificationId = id;
        return id;
      } else {
        // In-app fallback: fires heavy vibration and voice announcement when rest expires
        fallbackTimerId = setTimeout(() => {
          HapticsService.timerAlert();
          SpeechReceiptsService.speakTimerDone();
        }, Math.max(1, Math.floor(secondsRemaining)) * 1000);
        return 'fallback_timer_' + Date.now();
      }
    } catch (err) {
      console.warn('[TimerNotificationService] Schedule error:', err);
      return null;
    }
  },

  /**
   * Cancels any pending scheduled rest timer notification
   */
  cancelTimerAlarm: async (): Promise<void> => {
    if (fallbackTimerId) {
      clearTimeout(fallbackTimerId);
      fallbackTimerId = null;
    }

    if (!NotificationsModule || Platform.OS === 'web') return;

    try {
      if (activeNotificationId) {
        await NotificationsModule.cancelScheduledNotificationAsync(activeNotificationId);
        activeNotificationId = null;
      }
      await NotificationsModule.cancelAllScheduledNotificationsAsync();
    } catch {}
  },
};
