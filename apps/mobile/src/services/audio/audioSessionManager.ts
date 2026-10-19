import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Platform } from 'react-native';

export const PCM_16KHZ_RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

export class AudioSessionManager {
  private static isPrewarmed = false;
  private static isInitializing = false;
  private static permissionGranted = false;

  /**
   * Pre-warms the Audio session subsystem, requests mic permissions upfront,
   * and configures Bluetooth headset / hands-free routing (PlayAndRecord) + background audio.
   */
  public static async prewarm(): Promise<boolean> {
    if (Platform.OS === 'web') return true;
    if (this.isPrewarmed && this.permissionGranted) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    try {
      // 1. Request microphone permissions upfront
      const { status } = await Audio.requestPermissionsAsync();
      this.permissionGranted = status === 'granted';

      if (!this.permissionGranted) {
        console.warn('[AudioSessionManager] Microphone permission not granted');
        this.isInitializing = false;
        return false;
      }

      // 2. Configure audio session for zero-touch gym usage:
      // - allowsRecordingIOS: enables mic input
      // - playsInSilentModeIOS: allows earbud speech receipts even with iPhone ringer switched to silent
      // - staysActiveInBackground: keeps audio pipeline responsive
      // - shouldDuckAndroid: lowers background music (Spotify/Apple Music) while speaking receipts
      // - playThroughEarpieceAndroid: false (routes through Bluetooth/Speaker)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      });

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
   * Starts a low-latency 16kHz PCM recording using the pre-warmed audio session.
   * Eliminates the 100-250ms cold-start delay during Push-To-Talk presses.
   */
  public static async startInstantRecording(): Promise<Audio.Recording | null> {
    if (Platform.OS === 'web') return null;

    try {
      if (!this.isPrewarmed || !this.permissionGranted) {
        const ready = await this.prewarm();
        if (!ready) return null;
      }

      const { recording } = await Audio.Recording.createAsync(
        PCM_16KHZ_RECORDING_OPTIONS
      );

      return recording;
    } catch (error) {
      console.warn('[AudioSessionManager] Failed to start instant recording:', error);
      return null;
    }
  }

  /**
   * Safely stops and unloads a recording, returning the local file URI.
   */
  public static async stopRecording(recording: Audio.Recording | null): Promise<string | null> {
    if (!recording) return null;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      return uri;
    } catch (error) {
      console.warn('[AudioSessionManager] Error stopping recording:', error);
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
