import { Platform } from 'react-native';
import { File, Directory, Paths } from 'expo-file-system';
import { AudioSessionManager } from './audioSessionManager';
import { WORKER_BASE_URL } from '../../config/api';

export interface AudioParseResponse {
  ok: boolean;
  transcript?: string;
  workout?: any[];
  group_ids?: string[];
  set_ids?: string[];
  error?: string;
}

export const AudioClient = {
  /**
   * Uploads recorded audio (.m4a / native) to Cloudflare Worker Gemini Flash endpoint
   * for fast, accurate structured workout extraction and automatic KV persistence.
   */
  uploadAudioForParsing: async (
    audioUri: string,
    exerciseContext: string[] = [],
    sessionId: string = 'live_session'
  ): Promise<AudioParseResponse> => {
    try {
      if (Platform.OS === 'web') {
        return { ok: false, error: 'Web audio parsing not supported directly' };
      }

      console.log('[AudioClient] Reading audio file for parsing:', audioUri);
      const audioBase64 = await AudioSessionManager.readAudioBase64(audioUri);

      // Immediately delete recorded audio from device disk to prevent cache accumulation
      try {
        const file = new File(audioUri);
        if (file.exists) {
          file.delete();
        }
      } catch (delErr) {
        console.warn('[AudioClient] Could not delete audio cache file:', delErr);
      }

      if (!audioBase64) {
        return { ok: false, error: 'Failed to read recorded audio file' };
      }

      console.log('[AudioClient] Sending audio to Worker parse-audio API with 8s circuit breaker...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(`${WORKER_BASE_URL}/api/ai/parse-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            audio_base64: audioBase64,
            mime_type: 'audio/mp4',
            exercises: exerciseContext,
            session_id: sessionId,
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          console.warn('[AudioClient] Parse endpoint error:', response.status, errText);
          return { ok: false, error: `Server error (${response.status})` };
        }

        const result = await response.json();
        console.log('[AudioClient] Audio parse result:', result);
        return result;
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          console.warn('[AudioClient] Network request timed out (8s limit exceeded)');
          return { ok: false, error: 'Request timed out, please retry' };
        }
        throw fetchErr;
      }
    } catch (error) {
      console.warn('[AudioClient] Parse failed:', error);
      return { ok: false, error: String(error) };
    }
  },

  /**
   * Sweeps and purges orphaned audio recordings from cache
   */
  cleanStaleAudioCache: async (): Promise<void> => {
    if (Platform.OS === 'web') return;
    try {
      const audioDir = new Directory(Paths.cache, 'Audio');
      if (audioDir.exists) {
        const entries = audioDir.list();
        let count = 0;
        for (const entry of entries) {
          try {
            entry.delete();
            count++;
          } catch {}
        }
        if (count > 0) {
          console.log(`[AudioClient] Cleaned ${count} stale audio files from cache.`);
        }
      }
    } catch (e) {
      console.warn('[AudioClient] Cache clean warning:', e);
    }
  },
};


