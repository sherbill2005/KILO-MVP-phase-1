import { Platform } from 'react-native';
import { AudioSessionManager } from './audioSessionManager';
import { LiveAudioSocketService } from './liveAudioSocket';

export interface AudioParseResponse {
  ok: boolean;
  transcript?: string;
  workout?: any;
  error?: string;
}

export const AudioClient = {
  // Transmit recorded 16kHz PCM audio to Cloudflare Gemini Live WebSocket
  uploadAudioForParsing: async (
    audioUri: string,
    exerciseContext: string[] = [],
    sessionId: string = 'live_session'
  ): Promise<AudioParseResponse> => {
    try {
      if (Platform.OS === 'web') {
        return { ok: false, error: 'Web audio parsing not supported directly' };
      }

      // 1. Read 16kHz raw PCM linear bytes (stripping 44-byte WAV header)
      const pcm16Base64 = await AudioSessionManager.readPcm16Base64(audioUri);
      if (!pcm16Base64) {
        return { ok: false, error: 'Failed to extract PCM16 from audio file' };
      }

      // 2. Stream to Gemini Live WebSocket proxy
      const result = await LiveAudioSocketService.parseLiveAudio(
        pcm16Base64,
        sessionId,
        exerciseContext
      );

      return {
        ok: result.ok,
        transcript: result.transcript,
        workout: result.workout,
        error: result.error,
      };
    } catch (error) {
      console.warn('[AudioClient] Live socket parse failed:', error);
      return { ok: false, error: String(error) };
    }
  },
};

