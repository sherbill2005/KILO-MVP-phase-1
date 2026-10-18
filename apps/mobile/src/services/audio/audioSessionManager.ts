import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Platform } from 'react-native';

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
   * Starts a low-latency recording using the pre-warmed audio session.
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
        Audio.RecordingOptionsPresets.HIGH_QUALITY
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
