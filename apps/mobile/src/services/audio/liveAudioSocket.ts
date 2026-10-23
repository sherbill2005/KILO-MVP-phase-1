import { CANONICAL_EXERCISES } from '../../models/exercises';
import { WORKER_HOST, LIVE_WS_URL } from '../../config/api';

export { WORKER_HOST, LIVE_WS_URL };

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
      let resolved = false;
      let audioSent = false;

      const finish = (result: LiveAudioParseResult) => {
        if (resolved) return;
        resolved = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        try {
          if (ws && ws.readyState === WebSocket.OPEN) ws.close();
        } catch {}
        resolve(result);
      };

      // 15s total timeout — setup + Gemini round-trip can take a while
      timeoutTimer = setTimeout(() => {
        console.warn('[LiveAudioSocket] Timeout waiting for Gemini response');
        finish({ ok: false, error: 'Request timed out' });
      }, 15000);

      try {
        console.log('[LiveAudioSocket] Connecting to', LIVE_WS_URL);
        ws = new WebSocket(LIVE_WS_URL);

        ws.onopen = () => {
          console.log('[LiveAudioSocket] WebSocket connected. Sending session + context...');
          // 1. Send session handshake
          ws?.send(JSON.stringify({ type: 'session', session_id: sessionId }));
          // 2. Send exercise vocabulary context
          ws?.send(JSON.stringify({ type: 'context', exercises: exerciseContext }));
          // Audio is NOT sent yet — we wait for the "listening" status
          // which means Gemini has confirmed the setup is complete.
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[LiveAudioSocket] Server message:', data.type, data.value ?? '');

            if (data.type === 'status' && data.value === 'error') {
              finish({ ok: false, error: 'Server returned error status' });
              return;
            }

            // Gemini setup complete → now safe to send audio
            if (data.type === 'status' && data.value === 'listening' && !audioSent) {
              audioSent = true;
              console.log('[LiveAudioSocket] Gemini ready — sending audio...');
              ws?.send(JSON.stringify({ type: 'audio', data: pcm16Base64 }));
              ws?.send(JSON.stringify({ type: 'stop' }));
              return;
            }

            if (data.type === 'result') {
              finish({
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
          finish({ ok: false, error: err.message || 'WebSocket error' });
        };

        ws.onclose = () => {
          console.log('[LiveAudioSocket] WebSocket closed');
          finish({ ok: false, error: 'WebSocket closed unexpectedly' });
        };
      } catch (err: any) {
        console.warn('[LiveAudioSocket] Exception opening WebSocket:', err);
        finish({ ok: false, error: String(err) });
      }
    });
  }
}
