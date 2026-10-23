import { CANONICAL_EXERCISES } from '../../models/exercises';

const WORKER_API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://kilo-worker.sherbill2005.workers.dev/api';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || 'default-api-key';

export const WORKER_HOST = WORKER_API_BASE.replace(/^https?:\/\//, '').replace(/\/api$/, '');
export const LIVE_WS_URL = `wss://${WORKER_HOST}/ws/ai/live?token=${API_KEY}`;

export interface LiveAudioParseResult {
  ok: boolean;
  transcript?: string;
  workout?: any[];
  error?: string;
}

export class LiveAudioSocketService {
  private static socket: WebSocket | null = null;
  private static isConnecting = false;
  private static activeSessionId: string | null = null;

  /**
   * Sends 16kHz base64 PCM audio over the Gemini Live WebSocket,
   * waits for Gemini Live to complete its turn, and returns the parsed result.
   */
  public static async parseLiveAudio(
    pcm16Base64: string,
    sessionId: string = 'live_session',
    exerciseContext: string[] = CANONICAL_EXERCISES.map(e => e.name)
  ): Promise<LiveAudioParseResult> {
    return new Promise((resolve) => {
      let timeoutTimer: NodeJS.Timeout | null = null;
      let ws: WebSocket | null = null;

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        } catch {}
      };

      // Set timeout in case network or server stalls (8 seconds)
      timeoutTimer = setTimeout(() => {
        cleanup();
        console.warn('[LiveAudioSocket] Timeout waiting for Gemini response');
        resolve({ ok: false, error: 'Request timed out' });
      }, 8000);

      try {
        console.log('[LiveAudioSocket] Connecting to', LIVE_WS_URL);
        ws = new WebSocket(LIVE_WS_URL);

        ws.onopen = () => {
          console.log('[LiveAudioSocket] WebSocket connected. Sending handshake...');
          // 1. Send session handshake
          ws?.send(JSON.stringify({ type: 'session', session_id: sessionId }));

          // 2. Send exercise vocabulary context (first 35 exercises)
          ws?.send(JSON.stringify({ type: 'context', exercises: exerciseContext }));

          // 3. Send raw PCM16 base64 audio
          ws?.send(JSON.stringify({ type: 'audio', data: pcm16Base64 }));

          // 4. Send stop to demarcate end of utterance
          ws?.send(JSON.stringify({ type: 'stop' }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[LiveAudioSocket] Server message:', data.type);

            if (data.type === 'status' && data.value === 'error') {
              cleanup();
              resolve({ ok: false, error: 'Server returned error status' });
              return;
            }

            if (data.type === 'result') {
              cleanup();
              resolve({
                ok: true,
                transcript: data.transcript,
                workout: data.workout,
              });
              return;
            }
          } catch (parseErr) {
            console.warn('[LiveAudioSocket] Error parsing WS message:', parseErr);
          }
        };

        ws.onerror = (err: any) => {
          console.warn('[LiveAudioSocket] WebSocket error:', err.message || err);
          cleanup();
          resolve({ ok: false, error: err.message || 'WebSocket error' });
        };

        ws.onclose = () => {
          console.log('[LiveAudioSocket] WebSocket closed');
        };
      } catch (err: any) {
        cleanup();
        console.warn('[LiveAudioSocket] Exception opening WebSocket:', err);
        resolve({ ok: false, error: String(err) });
      }
    });
  }
}
