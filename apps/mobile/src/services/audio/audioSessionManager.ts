import {
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  AudioModule,
  IOSOutputFormat,
  AudioQuality,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { Platform, AppState, type AppStateStatus } from 'react-native';

export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 44100,
  },
  ios: {
    extension: '.m4a',
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 44100,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

/**
 * True 16kHz 16-bit mono Linear PCM WAV recording configuration
 * for Gemini Live WebSocket streaming (`LiveAudioSocketService` / `readPcm16Base64`).
 */
export const PCM_16KHZ_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    extension: '.wav',
    outputFormat: 'default',
    audioEncoder: 'default',
    sampleRate: 16000,
  },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256000,
  },
};

export class AudioSessionManager {
  private static isPrewarmed = false;
  private static isInitializing = false;
  private static permissionGranted = false;
  private static activeRecorder: AudioRecorder | null = null;
  private static appStateSubscribed = false;

  /**
   * Pre-warms the Audio session subsystem, requests mic permissions upfront,
   * and configures Bluetooth headset / hands-free routing + background audio.
   */
  public static async prewarm(): Promise<boolean> {
    if (Platform.OS === 'web') return true;
    if (this.isPrewarmed && this.permissionGranted) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    try {
      // 1. Request microphone permissions upfront
      const { granted } = await requestRecordingPermissionsAsync();
      this.permissionGranted = granted;

      if (!this.permissionGranted) {
        console.warn('[AudioSessionManager] Microphone permission not granted');
        this.isInitializing = false;
        return false;
      }

      // 2. Configure audio session for zero-touch gym usage:
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'duckOthers',
      });

      // 3. Listen for OS audio interruptions (phone call, alarm, screen lock)
      if (!this.appStateSubscribed) {
        AppState.addEventListener('change', (nextState: AppStateStatus) => {
          if (nextState !== 'active' && this.activeRecorder) {
            console.log('[AudioSessionManager] App interrupted by OS, safely stopping recording...');
            this.cancelActiveRecording();
          }
        });
        this.appStateSubscribed = true;
      }

      this.isPrewarmed = true;
      return true;
    } catch (error) {
      console.warn('[AudioSessionManager] Failed to prewarm audio session:', error);
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Starts a low-latency recording using the pre-warmed audio session.
   * Defaults to `.m4a` (`VOICE_RECORDING_OPTIONS`) for HTTP `/api/ai/parse-audio`,
   * or accepts `PCM_16KHZ_RECORDING_OPTIONS` for `.wav` WebSocket streaming.
   */
  public static async startInstantRecording(
    options: RecordingOptions = VOICE_RECORDING_OPTIONS
  ): Promise<AudioRecorder | null> {
    if (Platform.OS === 'web') return null;

    try {
      if (!this.isPrewarmed || !this.permissionGranted) {
        const ready = await this.prewarm();
        if (!ready) return null;
      }

      const recorder = new AudioModule.AudioRecorder(options);
      await recorder.prepareToRecordAsync();
      recorder.record();
      this.activeRecorder = recorder;

      return recorder;
    } catch (error) {
      console.warn('[AudioSessionManager] Failed to start instant recording:', error);
      return null;
    }
  }

  /**
   * Safely stops a recording, returning the local file URI.
   */
  public static async stopRecording(recorder: AudioRecorder | null): Promise<string | null> {
    if (!recorder) return null;
    if (this.activeRecorder === recorder) {
      this.activeRecorder = null;
    }

    try {
      await recorder.stop();
      const uri = recorder.uri;
      return uri;
    } catch (error) {
      console.warn('[AudioSessionManager] Error stopping recording:', error);
      return null;
    }
  }

  /**
   * Safely aborts any in-progress recording when interrupted by phone call or OS
   */
  public static async cancelActiveRecording(): Promise<void> {
    if (!this.activeRecorder) return;
    try {
      const rec = this.activeRecorder;
      this.activeRecorder = null;
      await rec.stop();
      if (rec.uri) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { File } = require('expo-file-system');
          const file = new File(rec.uri);
          if (file && file.exists) file.delete();
        } catch {}
      }
    } catch (e) {
      console.warn('[AudioSessionManager] Cancel recording error:', e);
    }
  }

  /**
   * Reads a recorded audio file (.m4a, .wav, etc.) and returns the clean base64 data.
   */
  public static async readAudioBase64(uri: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const commaIndex = base64data.indexOf(',');
          resolve(commaIndex !== -1 ? base64data.slice(commaIndex + 1) : base64data);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('[AudioSessionManager] Error reading audio base64:', err);
      return null;
    }
  }

  /**
   * Reads a recorded 16kHz WAV file, strips the 44-byte WAV header,
   * and returns raw 16kHz 16-bit linear PCM samples as a base64 string for Gemini Live.
   */
  public static async readPcm16Base64(uri: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const arrayBuf = await response.arrayBuffer();
      // Slice off standard 44-byte WAV header if present
      const pcmBuffer = arrayBuf.byteLength > 44 ? arrayBuf.slice(44) : arrayBuf;
      const bytes = new Uint8Array(pcmBuffer);
      let binary = '';
      const len = bytes.byteLength;
      const CHUNK = 8192;
      for (let i = 0; i < len; i += CHUNK) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK, len));
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      return btoa(binary);
    } catch (err) {
      console.warn('[AudioSessionManager] Error reading PCM16 from WAV:', err);
      return null;
    }
  }

  /**
   * Release or reset session if needed
   */
  public static async teardown(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      this.isPrewarmed = false;
    } catch (error) {
      console.warn('[AudioSessionManager] Teardown error:', error);
    }
  }
}
