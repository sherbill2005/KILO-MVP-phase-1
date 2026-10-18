import * as Speech from 'expo-speech';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { PreferencesService } from '../storage/preferences';
import { Platform } from 'react-native';

let audioConfigured = false;

async function ensureAudioSession() {
  if (audioConfigured || Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    });
    audioConfigured = true;
  } catch {
    // Ignored if unsupported
  }
}

export const SpeechReceiptsService = {
  // Speaks a quick, snappy receipt (e.g. "Logged: 80 kilos for 10")
  speakLoggedSet: async (exercise: string, weight: number, unit: string, reps: number) => {
    const isTtsEnabled = await PreferencesService.getTtsEnabled();
    if (!isTtsEnabled) return;

    await ensureAudioSession();

    try {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        await Speech.stop();
      }

      const unitWord = unit === 'lb' ? 'pounds' : 'kilos';
      const text = `${weight} ${unitWord}, ${reps} reps`;

      Speech.speak(text, {
        rate: 1.15, // Snappy gym tempo
        pitch: 1.0,
        language: 'en-US',
      });
    } catch {
      // Ignored if speech unavailable
    }
  },

  // Speaks an action update (e.g. "Weight changed to 85", "Set removed")
  speakMessage: async (message: string) => {
    const isTtsEnabled = await PreferencesService.getTtsEnabled();
    if (!isTtsEnabled) return;

    await ensureAudioSession();

    try {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        await Speech.stop();
      }

      Speech.speak(message, {
        rate: 1.15,
        pitch: 1.0,
        language: 'en-US',
      });
    } catch {
      // Ignored
    }
  },

  // Rest timer voice alert
  speakTimerDone: async () => {
    const isTtsEnabled = await PreferencesService.getTtsEnabled();
    if (!isTtsEnabled) return;

    await ensureAudioSession();

    try {
      Speech.speak('Rest time up, next set', {
        rate: 1.15,
        pitch: 1.0,
        language: 'en-US',
      });
    } catch {
      // Ignored
    }
  },
};
