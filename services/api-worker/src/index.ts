import type {
  WorkoutSession,
  WorkoutSet,
  WorkoutGroup,
} from "../../../packages/shared/types/workoutModel";
import { validateBatchPayload } from "./validation";
import type { Env } from "./env";
import { handleLiveWs } from "./live/liveProxy";
import { logWorkout } from "./live/persistWorkout";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });

const text = (message: string, status = 200) =>
  new Response(message, {
    status,
    headers: {
      "access-control-allow-origin": "*",
    },
  });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
            "access-control-allow-headers": "content-type, x-exercise-context",
          },
        });
      }

      const url = new URL(req.url);

      if (url.pathname === "/health" || url.pathname === "/") {
        return json({
          status: "healthy",
          kv: Boolean(env.KILO_KV),
          hasGeminiKey: Boolean(env.GEMINI_API_KEY),
          model: env.GEMINI_MODEL,
        });
      }

      if (req.method === "GET" && url.pathname === "/ws/ai/live") {
        return handleLiveWs(req, env);
      }

      if (req.method === "POST" && url.pathname === "/api/ai/parse-audio") {
        const body = (await req.json()) as {
          audio_base64: string;
          mime_type?: string;
          exercises?: string[];
          session_id?: string;
        };

        if (!body.audio_base64) {
          return text("Missing audio_base64", 400);
        }

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

        // The 4 models selected by the user:
        // 1. Gemini 3 Flash Live (gemini-3-flash-preview) - Unlimited RPM/RPD
        // 2. Gemini 3.8 Live / Flash (gemini-3.8-flash)
        // 3. Gemini 3.5 Transcribe Live (gemini-3.5-transcribe) - Unlimited RPM/RPD
        // 4. Gemini 2.5 Flash Native Audio Dialog (gemini-2.5-flash-native-audio-preview-12-2025)
        const modelsToTry = [
          "gemini-3-flash-preview",
          "gemini-3.8-flash",
          "gemini-3.5-transcribe",
        ];

        let geminiRes: Response | null = null;
        let lastStatus = 0;
        outer: for (const model of modelsToTry) {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
          
          // gemini-3.5-transcribe is pure transcription model; JSON mode must not be passed
          const isTranscribeModel = model.includes("transcribe");
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
            ...(isTranscribeModel
              ? {}
              : {
                  generationConfig: {
                    response_mime_type: "application/json",
                    temperature: 0.1,
                  },
                }),
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
            if (!retryable) break; // try next model
            await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
          }
        }

        if (!geminiRes) {
          return json(
            { ok: false, error: `Gemini unavailable (${lastStatus}), please retry` },
            503
          );
        }

        const geminiData = (await geminiRes.json()) as any;
        const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
          return json({ ok: false, error: "Empty response from AI" }, 500);
        }

        let parsed: { transcript?: string; workout?: any[] } = {};
        try {
          parsed = JSON.parse(responseText);
        } catch {
          console.warn("[api/ai/parse-audio] Direct JSON parse failed, converting via gemini-3-flash-preview:", responseText);
          try {
            const textUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${env.GEMINI_API_KEY}`;
            const textRes = await fetch(textUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `Extract structured workout JSON from this spoken gym text: "${responseText}".\nExercises: ${exercises.slice(0, 30).join(", ")}\nSchema:\n{\n  "transcript": "${responseText.replace(/"/g, '\\"')}",\n  "workout": [\n    {\n      "exercise": "Bench Press",\n      "sets": [{ "weight": 80, "unit": "kg", "reps": 10 }]\n    }\n  ]\n}`
                  }]
                }],
                generationConfig: { response_mime_type: "application/json" }
              })
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

        return json({
          ok: true,
          transcript,
          workout,
          group_ids,
          set_ids,
        });
      }

      if (req.method === "POST" && url.pathname === "/api/workouts/sync-batch") {
        const body = (await req.json()) as { session: any };
        if (!body.session || !body.session.id) {
          return text("Missing session payload", 400);
        }

        const s = body.session;
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
                  weight_unit: (st.weightUnit ?? st.weight_unit ?? "kg").toLowerCase() === "lb" ? "lb" : "kg",
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
          workout_date: s.workoutDate || s.workout_date || new Date().toISOString().split("T")[0],
          started_at: s.startedAt || Date.now(),
          finished_at: s.finishedAt || null,
          mode: s.mode || "LIVE",
          group_ids,
          set_ids,
          finished: Boolean(s.finishedAt),
        };

        await env.KILO_KV.put(`session:${sessionId}`, JSON.stringify(workoutSession));
        return json({ ok: true, session_id: sessionId, set_count: set_ids.length });
      }

    if (req.method === "POST" && url.pathname === "/api/sessions") {
      const body = (await req.json()) as {
        user_id: string;
        workout_date: string;
      };

      if (typeof body.user_id !== "string" || body.user_id.trim() === "") {
        return text("Invalid user_id", 400);
      }
      if (
        typeof body.workout_date !== "string" ||
        Number.isNaN(Date.parse(body.workout_date))
      ) {
        return text("Invalid workout_date", 400);
      }

      const session: WorkoutSession = {
        id: crypto.randomUUID(),
        user_id: body.user_id,
        workout_date: body.workout_date,
        group_ids: [],
        set_ids: [],
        finished: false,
      };

      await env.KILO_KV.put(`session:${session.id}`, JSON.stringify(session));
      return json({ session_id: session.id });
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
      return json({ sessions });
    }

    const match = url.pathname.match(/^\/api\/sessions\/([^\/]+)\/sets$/);
    if (req.method === "POST" && match) {
      const session_id = match[1];
      const raw = await env.KILO_KV.get(`session:${session_id}`);
      if (!raw) {
        return text("Session not found", 404);
      }

      const body = (await req.json()) as any;
      const batch = Array.isArray(body.sets)
        ? body
        : {
            exercise_name: body.exercise_name,
            sets: [
              {
                weight_value: body.weight_value,
                weight_unit: body.weight_unit,
                reps: body.reps,
              },
            ],
          };

      const validation = validateBatchPayload(batch);
      if (!validation.ok) {
        return text(validation.message || "Invalid batch payload", 400);
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
          : { group_id, set_ids }
      );
    }

    const finishMatch = url.pathname.match(/^\/api\/sessions\/([^\/]+)\/finish$/);
    if (req.method === "POST" && finishMatch) {
      const session_id = finishMatch[1];
      const raw = await env.KILO_KV.get(`session:${session_id}`);
      if (!raw) {
        return text("Session not found", 404);
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

      return json({ ok: true, finished_at: finishedAt });
    }

    const sessionDetailMatch = url.pathname.match(/^\/api\/sessions\/([^\/]+)$/);
    if (req.method === "GET" && sessionDetailMatch) {
      const session_id = sessionDetailMatch[1];
      const raw = await env.KILO_KV.get(`session:${session_id}`);
      if (!raw) {
        return text("Session not found", 404);
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

      return json({ ...session, groups, sets });
    }

    const patchMatch = url.pathname.match(/^\/api\/sets\/([^\/]+)$/);
    if (req.method === "PATCH" && patchMatch) {
      const set_id = patchMatch[1];
      const raw = await env.KILO_KV.get(`set:${set_id}`);
      if (!raw) {
        return text("Set not found", 404);
      }

      const set = JSON.parse(raw) as WorkoutSet;
      const body = (await req.json()) as Partial<WorkoutSet>;

      if (typeof body.exercise_name === "string") {
        set.exercise_name = body.exercise_name;
      }
      if (typeof body.weight_value === "number") {
        set.weight_value = body.weight_value;
      }
      if (
        typeof body.weight_unit === "string" &&
        (body.weight_unit === "kg" || body.weight_unit === "lb")
      ) {
        set.weight_unit = body.weight_unit;
      }
      if (typeof body.reps === "number") {
        set.reps = body.reps;
      }

      set.corrected = true;
      await env.KILO_KV.put(`set:${set.id}`, JSON.stringify(set));
      return json({ ok: true });
    }

    return text("Not Found", 404);
    } catch (err: any) {
      console.error("Worker unhandled error:", err);
      return json(
        {
          error: err?.message || String(err),
          stack: err?.stack,
        },
        500
      );
    }
  },
};
