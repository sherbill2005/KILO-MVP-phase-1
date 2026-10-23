import type {
  WorkoutSession,
  WorkoutSet,
  WorkoutGroup,
} from "../../../packages/shared/types/workoutModel";
import { BatchPayloadSchema, SessionCreateSchema, SetPatchSchema } from "./validation";
import type { Env } from "./env";
import { handleLiveWs } from "./live/liveProxy";
import { z } from "zod";

const getCorsHeaders = (req: Request, env: Env) => {
  const origin = req.headers.get("Origin");
  let allowedOrigin = "*";

  if (env.ALLOWED_ORIGINS) {
    if (origin) {
      const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
      if (allowedOrigins.includes(origin)) {
        allowedOrigin = origin;
      } else {
        // If not in allowed list, reject CORS for browsers
        allowedOrigin = "null";
      }
    } else {
       // Optional: what to do if no origin is provided? Usually API requests from non-browsers
       // don't send Origin, so you might want to omit the header or keep it tight based on security needs.
       // We'll set it to null or leave it empty if origins are strictly enforced.
       allowedOrigin = "null";
    }
  }

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type, authorization, x-exercise-context",
  };
};

const json = (data: unknown, status = 200, req?: Request, env?: Env) => {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (req && env) {
    Object.assign(headers, getCorsHeaders(req, env));
  } else {
    headers["access-control-allow-origin"] = "*";
  }
  return new Response(JSON.stringify(data), { status, headers });
};

const errorJson = (message: string, code: string, status = 400, req?: Request, env?: Env) =>
  json({ error: { message, code } }, status, req, env);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(req, env),
      });
    }

    const url = new URL(req.url);

    // Authentication
    const authHeader = req.headers.get("Authorization");
    const wsToken = url.searchParams.get("token");
    let isAuthenticated = false;

    if (env.KILO_API_KEY) {
      if (authHeader && authHeader === `Bearer ${env.KILO_API_KEY}`) {
        isAuthenticated = true;
      } else if (wsToken && wsToken === env.KILO_API_KEY) {
        isAuthenticated = true;
      }
    } else {
      // If no API key is configured, allow temporarily (or you can enforce it).
      // For security, let's enforce it if we're in prod, but for now we'll fail if missing in env.
      return errorJson("Server configuration error: Missing API Key", "INTERNAL_SERVER_ERROR", 500, req, env);
    }

    if (!isAuthenticated) {
      return errorJson("Unauthorized", "UNAUTHORIZED", 401, req, env);
    }

    if (req.method === "GET" && url.pathname === "/ws/ai/live") {
      return handleLiveWs(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/sessions") {
      let body: unknown;
      try {
        body = await req.json();
      } catch (e) {
        return errorJson("Invalid JSON", "BAD_REQUEST", 400, req, env);
      }

      const parsed = SessionCreateSchema.safeParse(body);
      if (!parsed.success) {
        return errorJson(parsed.error.issues[0].message, "VALIDATION_ERROR", 400, req, env);
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
      return json({ session_id: session.id }, 201, req, env);
    }

    const match = url.pathname.match(/^\/api\/sessions\/([^\/]+)\/sets$/);
    if (req.method === "POST" && match) {
      const session_id = match[1];
      const raw = await env.KILO_KV.get(`session:${session_id}`);
      if (!raw) {
        return errorJson("Session not found", "NOT_FOUND", 404, req, env);
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch (e) {
        return errorJson("Invalid JSON", "BAD_REQUEST", 400, req, env);
      }

      const payloadBody = body as any;
      const batch = Array.isArray(payloadBody.sets)
        ? payloadBody
        : {
            exercise_name: payloadBody.exercise_name,
            sets: [
              {
                weight_value: payloadBody.weight_value,
                weight_unit: payloadBody.weight_unit,
                reps: payloadBody.reps,
              },
            ],
          };

      const parsed = BatchPayloadSchema.safeParse(batch);
      if (!parsed.success) {
        return errorJson(parsed.error.issues[0].message, "VALIDATION_ERROR", 400, req, env);
      }

      const validatedBatch = parsed.data;

      const session = JSON.parse(raw) as WorkoutSession;
      if (!Array.isArray(session.group_ids)) session.group_ids = [];

      const group_id = crypto.randomUUID();
      const set_ids: string[] = [];

      for (let i = 0; i < validatedBatch.sets.length; i++) {
        const s = validatedBatch.sets[i];
        const set: WorkoutSet = {
          id: crypto.randomUUID(),
          session_id,
          group_id,
          group_index: i + 1,
          exercise_name: validatedBatch.exercise_name,
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
        exercise_name: validatedBatch.exercise_name,
        set_ids,
        created_at: new Date().toISOString(),
      };
      await env.KILO_KV.put(`group:${group_id}`, JSON.stringify(group));

      session.set_ids.push(...set_ids);
      session.group_ids.push(group_id);
      await env.KILO_KV.put(`session:${session_id}`, JSON.stringify(session));

      return json(
        validatedBatch.sets.length === 1
          ? { set_id: set_ids[0], group_id }
          : { group_id, set_ids },
        201, req, env
      );
    }

    const patchMatch = url.pathname.match(/^\/api\/sets\/([^\/]+)$/);
    if (req.method === "PATCH" && patchMatch) {
      const set_id = patchMatch[1];
      const raw = await env.KILO_KV.get(`set:${set_id}`);
      if (!raw) {
        return errorJson("Set not found", "NOT_FOUND", 404, req, env);
      }

      const set = JSON.parse(raw) as WorkoutSet;
      let body: unknown;
      try {
        body = await req.json();
      } catch (e) {
        return errorJson("Invalid JSON", "BAD_REQUEST", 400, req, env);
      }

      const parsed = SetPatchSchema.safeParse(body);
      if (!parsed.success) {
        return errorJson(parsed.error.issues[0].message, "VALIDATION_ERROR", 400, req, env);
      }

      const patchData = parsed.data;

      if (patchData.exercise_name !== undefined) {
        set.exercise_name = patchData.exercise_name;
      }
      if (patchData.weight_value !== undefined) {
        set.weight_value = patchData.weight_value;
      }
      if (patchData.weight_unit !== undefined) {
        set.weight_unit = patchData.weight_unit;
      }
      if (patchData.reps !== undefined) {
        set.reps = patchData.reps;
      }

      set.corrected = true;
      await env.KILO_KV.put(`set:${set.id}`, JSON.stringify(set));
      return json({ ok: true }, 200, req, env);
    }

    return errorJson("Not Found", "NOT_FOUND", 404, req, env);
  },
};
