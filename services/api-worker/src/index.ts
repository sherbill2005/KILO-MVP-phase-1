import type {
  WorkoutSession,
  WorkoutSet,
  WorkoutGroup,
} from "../../../packages/shared/types/workoutModel";
import {
  BatchPayloadSchema,
  ParseAudioSchema,
  SessionCreateSchema,
  SetPatchSchema,
  SyncBatchSchema,
  validateBatchPayload,
} from "./validation";
import type { Env } from "./env";
import { handleLiveWs } from "./live/liveProxy";
import { logWorkout } from "./live/persistWorkout";

export function getCorsHeaders(req: Request, env?: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  let allowedOrigin = "*";

  if (env?.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.trim() !== "") {
    if (origin) {
      const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
      allowedOrigin = allowedOrigins.includes(origin) ? origin : "null";
    } else {
      // Non-browser native mobile clients (React Native fetch/WS) do not send an Origin header
      allowedOrigin = "*";
    }
  }

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-exercise-context",
  };
}

const json = (data: unknown, status = 200, req?: Request, env?: Env) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...(req ? getCorsHeaders(req, env) : { "access-control-allow-origin": "*" }),
    },
  });

const errorJson = (
  message: string,
  code = "BAD_REQUEST",
  status = 400,
  req?: Request,
  env?: Env
) => json({ error: { message, code } }, status, req, env);

/**
 * Constant-time secret comparison using SHA-256 digests so input length
 * and character position differences never leak timing information.
 */
export async function timingSafeTokenEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(hashA, hashB);
  }

  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) {
    diff |= viewA[i] ^ viewB[i];
  }
  return diff === 0 && a.length === b.length;
}

async function verifyRequestAuth(req: Request, url: URL, env: Env): Promise<boolean> {
  if (!env.KILO_API_KEY || env.KILO_API_KEY.trim() === "") {
    // Dev-friendly fallback when KILO_API_KEY is not configured in environment
    return true;
  }

  const expectedKey = env.KILO_API_KEY.trim();
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (await timingSafeTokenEqual(bearerToken, expectedKey)) {
      return true;
    }
  }

  const wsToken = url.searchParams.get("token");
  if (wsToken && (await timingSafeTokenEqual(wsToken.trim(), expectedKey))) {
    return true;
  }

  return false;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: getCorsHeaders(req, env),
        });
      }

      const url = new URL(req.url);

      // Public health probe endpoint (always accessible without auth)
      if (url.pathname === "/health" || url.pathname === "/") {
        return json(
          {
            status: "healthy",
            kv: Boolean(env.KILO_KV),
            hasGeminiKey: Boolean(env.GEMINI_API_KEY),
            model: env.GEMINI_MODEL,
          },
          200,
          req,
          env
        );
      }

      // Optional timing-safe API Key Authentication when env.KILO_API_KEY is configured
      const isAuthorized = await verifyRequestAuth(req, url, env);
      if (!isAuthorized) {
        return errorJson("Unauthorized", "UNAUTHORIZED", 401, req, env);
      }

      if (req.method === "GET" && url.pathname === "/ws/ai/live") {
        return handleLiveWs(req, env);
      }

      if (req.method === "POST" && url.pathname === "/api/ai/parse-audio") {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return errorJson("Invalid JSON", "BAD_REQUEST", 400, req, env);
        }

        const parsedReq = ParseAudioSchema.safeParse(rawBody);
        if (!parsedReq.success) {
          return errorJson(
            parsedReq.error.issues[0]?.message || "Missing audio_base64",
            "VALIDATION_ERROR",
            400,
            req,
            env
          );
        }

        const body = parsedReq.data;
        const mimeType = body.mime_type || "audio/mp4";
        const exercises = body.exercises || [];
        const sessionId = body.session_id || "live_session";

        const systemInstruction = `You are a voice workout logger for an offline gym app.
The user speaks their workout set into their phone microphone.
Available exercises for context:
${exercises.slice(0, 50).join(", ")}

Instructions:
1. Listen carefully to what the user said in the audio.
2. Transcribe their spoken command accurately.
3. Extract the workout:
   - Match the exercise name to one of the canonical exercises if mentioned, or use what was spoken.
   - Extract sets, weight value, weight unit ("kg" or "lb", defaulting to "kg"), and reps.
4. Output STRICT JSON with this schema:
{
  "transcript": "what the user said",
  "workout": [
    {
      "exercise": "Bench Press",
      "sets": [
        { "weight": 80, "unit": "kg", "reps": 10 }
      ]
    }
  ]
}
If no exercise or workout was spoken (e.g. background noise, cough, silence), output:
{
  "transcript": "...",
  "workout": []
}`;

        const modelsToTry = Array.from(
          new Set([
            env.GEMINI_MODEL || "gemini-3-flash-preview",
            "gemini-3-flash-preview",
            "gemini-2.5-flash",
          ])
        );

        let geminiRes: Response | null = null;
        let lastStatus = 0;
        outer: for (const model of modelsToTry) {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

          const payload = {
            contents: [
              {
                role: "user",
                parts: [
                  { text: systemInstruction },
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: body.audio_base64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: "application/json",
              temperature: 0.1,
            },
          };

          for (let attempt = 0; attempt < 3; attempt++) {
            const res = await fetch(geminiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (res.ok) {
              geminiRes = res;
              break outer;
            }
            lastStatus = res.status;
            const errText = await res.text();
            console.error(
              `[api/ai/parse-audio] ${model} attempt ${attempt + 1} failed:`,
              res.status,
              errText.slice(0, 300)
            );
            const retryable = res.status === 429 || res.status >= 500;
            if (!retryable) break;
            await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
          }
        }

        if (!geminiRes) {
          return json(
            { ok: false, error: `Gemini unavailable (${lastStatus}), please retry` },
            503,
            req,
            env
          );
        }

        const geminiData = (await geminiRes.json()) as any;
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
          return json({ ok: false, error: "Empty response from AI" }, 500, req, env);
        }

        let parsed: { transcript?: string; workout?: any[] } = {};
        try {
          parsed = JSON.parse(responseText);
        } catch {
          console.warn(
            "[api/ai/parse-audio] Direct JSON parse failed, converting via gemini-3-flash-preview:",
            responseText
          );
          try {
            const fallbackModel = env.GEMINI_MODEL || "gemini-3-flash-preview";
            const textUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${env.GEMINI_API_KEY}`;
            const textRes = await fetch(textUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `Extract structured workout JSON from this spoken gym text: "${responseText}".\nExercises: ${exercises.slice(0, 30).join(", ")}\nSchema:\n{\n  "transcript": "${responseText.replace(/"/g, '\\"')}",\n  "workout": [\n    {\n      "exercise": "Bench Press",\n      "sets": [{ "weight": 80, "unit": "kg", "reps": 10 }]\n    }\n  ]\n}`,
                      },
                    ],
                  },
                ],
                generationConfig: { response_mime_type: "application/json" },
              }),
            });
            if (textRes.ok) {
              const textJson = (await textRes.json()) as any;
              const t = textJson.candidates?.[0]?.content?.parts?.[0]?.text;
              if (t) parsed = JSON.parse(t);
            }
          } catch (tErr) {
            console.error("[api/ai/parse-audio] Fallback text parse error:", tErr);
          }
        }

        const workout = parsed.workout || [];
        const transcript = parsed.transcript || responseText || "";

        let group_ids: string[] = [];
        let set_ids: string[] = [];

        if (workout.length > 0) {
          try {
            const rawSession = await env.KILO_KV.get(`session:${sessionId}`);
            if (!rawSession) {
              const fallbackSession = {
                id: sessionId,
                user_id: "usr_local",
                workout_date: new Date().toISOString().split("T")[0],
                group_ids: [],
                set_ids: [],
                finished: false,
              };
              await env.KILO_KV.put(`session:${sessionId}`, JSON.stringify(fallbackSession));
            }

            const logged = await logWorkout(env, sessionId, workout);
            group_ids = logged.group_ids;
            set_ids = logged.set_ids;
          } catch (logErr) {
            console.warn("[api/ai/parse-audio] logWorkout warning:", logErr);
          }
        }

        return json(
          {
            ok: true,
            transcript,
            workout,
            group_ids,
            set_ids,
          },
          200,
          req,
          env
        );
      }

      if (req.method === "POST" && url.pathname === "/api/workouts/sync-batch") {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return errorJson("Invalid JSON", "BAD_REQUEST", 400, req, env);
        }

        const parsedSync = SyncBatchSchema.safeParse(rawBody);
        if (!parsedSync.success) {
          return errorJson(
            parsedSync.error.issues[0]?.message || "Missing session payload",
            "VALIDATION_ERROR",
            400,
            req,
            env
          );
        }

        const s = parsedSync.data.session as any;
        const sessionId = s.id;
        const group_ids: string[] = [];
        const set_ids: string[] = [];

        if (Array.isArray(s.groups)) {
          for (const g of s.groups) {
            const groupId = g.id || crypto.randomUUID();
            const gSetIds: string[] = [];
            if (Array.isArray(g.sets)) {
              for (let i = 0; i < g.sets.length; i++) {
                const st = g.sets[i];
                const setId = st.id || crypto.randomUUID();
                const workoutSet = {
                  id: setId,
                  session_id: sessionId,
                  group_id: groupId,
                  group_index: i + 1,
                  exercise_name: g.exerciseName || g.exercise_name || "Exercise",
                  weight_value: Number(st.weightValue ?? st.weight_value ?? 0),
                  weight_unit:
                    (st.weightUnit ?? st.weight_unit ?? "kg").toLowerCase() === "lb"
                      ? "lb"
                      : "kg",
                  reps: Number(st.reps ?? 0),
                  corrected: Boolean(st.isCorrected ?? st.is_corrected),
                  created_at: new Date(st.createdAt || Date.now()).toISOString(),
                };
                await env.KILO_KV.put(`set:${setId}`, JSON.stringify(workoutSet));
                gSetIds.push(setId);
                set_ids.push(setId);
              }
            }

            const workoutGroup = {
              id: groupId,
              session_id: sessionId,
              exercise_name: g.exerciseName || g.exercise_name || "Exercise",
              set_ids: gSetIds,
              created_at: new Date(g.createdAt || Date.now()).toISOString(),
            };
            await env.KILO_KV.put(`group:${groupId}`, JSON.stringify(workoutGroup));
            group_ids.push(groupId);
          }
        }

        const workoutSession = {
          id: sessionId,
          user_id: s.userId || s.user_id || "usr_local",
          workout_date:
            s.workoutDate || s.workout_date || new Date().toISOString().split("T")[0],
          started_at: s.startedAt || s.started_at || Date.now(),
          finished_at: s.finishedAt || s.finished_at || null,
          mode: s.mode || "LIVE",
          group_ids,
          set_ids,
          finished: Boolean(s.finishedAt || s.finished_at),
        };

        await env.KILO_KV.put(`session:${sessionId}`, JSON.stringify(workoutSession));
        return json(
          { ok: true, session_id: sessionId, set_count: set_ids.length },
          200,
          req,
          env
        );
      }

      if (req.method === "POST" && url.pathname === "/api/sessions") {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return errorJson("Invalid JSON", "BAD_REQUEST", 400, req, env);
        }

        const parsed = SessionCreateSchema.safeParse(rawBody);
        if (!parsed.success) {
          return errorJson(
            parsed.error.issues[0]?.message || "Invalid session payload",
            "VALIDATION_ERROR",
            400,
            req,
            env
          );
        }

        const session: WorkoutSession = {
          id: crypto.randomUUID(),
          user_id: parsed.data.user_id,
          workout_date: parsed.data.workout_date,
          group_ids: [],
          set_ids: [],
          finished: false,
        };

        await env.KILO_KV.put(`session:${session.id}`, JSON.stringify(session));
        return json({ session_id: session.id }, 200, req, env);
      }

      if (req.method === "GET" && url.pathname === "/api/sessions") {
        const targetUserId = url.searchParams.get("user_id");
        const listRes = await env.KILO_KV.list({ prefix: "session:" });
        const sessions: WorkoutSession[] = [];

        for (const key of listRes.keys) {
          const raw = await env.KILO_KV.get(key.name);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as WorkoutSession;
              if (!targetUserId || parsed.user_id === targetUserId) {
                sessions.push(parsed);
              }
            } catch {
              // Ignore malformed entries
            }
          }
        }

        sessions.sort((a, b) => (b.workout_date || "").localeCompare(a.workout_date || ""));
        return json({ sessions }, 200, req, env);
      }

      const match = url.pathname.match(/^\/api\/sessions\/([^\/]+)\/sets$/);
      if (req.method === "POST" && match) {
        const session_id = match[1];
        const raw = await env.KILO_KV.get(`session:${session_id}`);
        if (!raw) {
          return errorJson("Session not found", "NOT_FOUND", 404, req, env);
        }

        let body: any;
        try {
          body = await req.json();
        } catch {
          return errorJson("Invalid JSON", "BAD_REQUEST", 400, req, env);
        }

        const batch = Array.isArray(body?.sets)
          ? body
          : {
              exercise_name: body?.exercise_name,
              sets: [
                {
                  weight_value: body?.weight_value,
                  weight_unit: body?.weight_unit,
                  reps: body?.reps,
                },
              ],
            };

        const validation = validateBatchPayload(batch);
        if (!validation.ok) {
          return errorJson(
            validation.message || "Invalid batch payload",
            "VALIDATION_ERROR",
            400,
            req,
            env
          );
        }

        const session = JSON.parse(raw) as WorkoutSession;
        if (!Array.isArray(session.group_ids)) session.group_ids = [];

        const group_id = crypto.randomUUID();
        const set_ids: string[] = [];

        for (let i = 0; i < batch.sets.length; i++) {
          const s = batch.sets[i];
          const set: WorkoutSet = {
            id: crypto.randomUUID(),
            session_id,
            group_id,
            group_index: i + 1,
            exercise_name: batch.exercise_name,
            weight_value: s.weight_value,
            weight_unit: s.weight_unit,
            reps: s.reps,
            corrected: false,
            created_at: new Date().toISOString(),
          };
          await env.KILO_KV.put(`set:${set.id}`, JSON.stringify(set));
          set_ids.push(set.id);
        }

        const group: WorkoutGroup = {
          id: group_id,
          session_id,
          exercise_name: batch.exercise_name,
          set_ids,
          created_at: new Date().toISOString(),
        };
        await env.KILO_KV.put(`group:${group_id}`, JSON.stringify(group));

        session.set_ids.push(...set_ids);
        session.group_ids.push(group_id);
        await env.KILO_KV.put(`session:${session_id}`, JSON.stringify(session));

        return json(
          batch.sets.length === 1
            ? { set_id: set_ids[0], group_id }
            : { group_id, set_ids },
          200,
          req,
          env
        );
      }

      const finishMatch = url.pathname.match(/^\/api\/sessions\/([^\/]+)\/finish$/);
      if (req.method === "POST" && finishMatch) {
        const session_id = finishMatch[1];
        const raw = await env.KILO_KV.get(`session:${session_id}`);
        if (!raw) {
          return errorJson("Session not found", "NOT_FOUND", 404, req, env);
        }

        const session = JSON.parse(raw) as WorkoutSession;
        let finishedAt = new Date().toISOString();

        try {
          const body = (await req.json()) as { finished_at?: string };
          if (body?.finished_at && !Number.isNaN(Date.parse(body.finished_at))) {
            finishedAt = body.finished_at;
          }
        } catch {
          // Optional JSON payload; defaults to current ISO time
        }

        session.finished = true;
        session.finished_at = finishedAt;
        await env.KILO_KV.put(`session:${session_id}`, JSON.stringify(session));

        return json({ ok: true, finished_at: finishedAt }, 200, req, env);
      }

      const sessionDetailMatch = url.pathname.match(/^\/api\/sessions\/([^\/]+)$/);
      if (req.method === "GET" && sessionDetailMatch) {
        const session_id = sessionDetailMatch[1];
        const raw = await env.KILO_KV.get(`session:${session_id}`);
        if (!raw) {
          return errorJson("Session not found", "NOT_FOUND", 404, req, env);
        }

        const session = JSON.parse(raw) as WorkoutSession;
        const groups: WorkoutGroup[] = [];
        const sets: WorkoutSet[] = [];

        if (Array.isArray(session.group_ids)) {
          for (const groupId of session.group_ids) {
            const rawGroup = await env.KILO_KV.get(`group:${groupId}`);
            if (rawGroup) {
              try {
                groups.push(JSON.parse(rawGroup) as WorkoutGroup);
              } catch {
                // Ignore corrupted group
              }
            }
          }
        }

        if (Array.isArray(session.set_ids)) {
          for (const setId of session.set_ids) {
            const rawSet = await env.KILO_KV.get(`set:${setId}`);
            if (rawSet) {
              try {
                sets.push(JSON.parse(rawSet) as WorkoutSet);
              } catch {
                // Ignore corrupted set
              }
            }
          }
        }

        return json({ ...session, groups, sets }, 200, req, env);
      }

      const patchMatch = url.pathname.match(/^\/api\/sets\/([^\/]+)$/);
      if (req.method === "PATCH" && patchMatch) {
        const set_id = patchMatch[1];
        const raw = await env.KILO_KV.get(`set:${set_id}`);
        if (!raw) {
          return errorJson("Set not found", "NOT_FOUND", 404, req, env);
        }

        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return errorJson("Invalid JSON", "BAD_REQUEST", 400, req, env);
        }

        const parsed = SetPatchSchema.safeParse(rawBody);
        if (!parsed.success) {
          return errorJson(
            parsed.error.issues[0]?.message || "Invalid patch payload",
            "VALIDATION_ERROR",
            400,
            req,
            env
          );
        }

        const set = JSON.parse(raw) as WorkoutSet;
        const body = parsed.data;

        if (body.exercise_name !== undefined) {
          set.exercise_name = body.exercise_name;
        }
        if (body.weight_value !== undefined) {
          set.weight_value = body.weight_value;
        }
        if (body.weight_unit !== undefined) {
          set.weight_unit = body.weight_unit;
        }
        if (body.reps !== undefined) {
          set.reps = body.reps;
        }

        set.corrected = true;
        await env.KILO_KV.put(`set:${set.id}`, JSON.stringify(set));
        return json({ ok: true }, 200, req, env);
      }

      return errorJson("Not Found", "NOT_FOUND", 404, req, env);
    } catch (err: any) {
      console.error("Worker unhandled error:", err);
      return json(
        {
          error: err?.message || String(err),
          stack: err?.stack,
        },
        500,
        req,
        env
      );
    }
  },
};
