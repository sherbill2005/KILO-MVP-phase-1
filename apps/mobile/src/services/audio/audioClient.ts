import { Platform } from 'react-native';

const WORKER_URL = 'http://127.0.0.1:8787';

export interface AudioParseResponse {
  ok: boolean;
  transcript?: string;
  workout?: any;
  error?: string;
}

export const AudioClient = {
  // Transmit recorded audio file to Cloudflare Worker
  uploadAudioForParsing: async (
    audioUri: string,
    exerciseContext: string[] = []
  ): Promise<AudioParseResponse> => {
    try {
      if (Platform.OS === 'web') {
        return { ok: false, error: 'Web audio parsing not supported directly' };
      }

      const formData = new FormData();
      const filename = audioUri.split('/').pop() || 'recording.m4a';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `audio/${match[1]}` : 'audio/m4a';

      // @ts-ignore - React Native FormData accepts uri/name/type object
      formData.append('audio', {
        uri: audioUri,
        name: filename,
        type,
      });

      const response = await fetch(`${WORKER_URL}/api/ai/parse`, {
        method: 'POST',
        headers: {
          'x-exercise-context': exerciseContext.join(','),
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        return { ok: false, error: errText || 'Audio parse failed' };
      }

      const data = await response.json();
      return { ok: true, transcript: data.transcript, workout: data.workout };
    } catch (error) {
      console.warn('[AudioClient] Cloud upload failed, offline fallback:', error);
      return { ok: false, error: String(error) };
    }
  },
};
