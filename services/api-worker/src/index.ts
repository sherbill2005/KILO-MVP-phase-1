import type { WorkoutSession,WorkoutSet } from "../../../packages/shared/types/workoutModel";  
import type { Env } from "./env";
import { parseAudioWithGemini } from "./ai/gemini";
import { handleLiveWs } from "./live/liveProxy";

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
        if (req.method === "GET" && url.pathname === "/ws/ai/live") {
            return handleLiveWs(req, env);
        }
        if (req.method === "POST" && url.pathname === "/api/sessions") 
            {
            const body = (await req.json()) as { user_id: string; workout_date: string };
            console.log("GEMINI_API_KEY present:", Boolean(env.GEMINI_API_KEY));
            //validate body 
            if (typeof body.user_id !== "string" || body.user_id.trim() === "") {
                return text("Invalid user_id", 400);
            }
            if (typeof body.workout_date !== "string" || isNaN(Date.parse(body.workout_date))) {
                return text("Invalid workout_date", 400);
            }

                const session: WorkoutSession = {
                    id: crypto.randomUUID(),
                    user_id: body.user_id,
                    workout_date: body.workout_date,
                    set_ids: [],
                    finished: false,
                
            };
            await env.KILO_KV.put(`session:${session.id}`, JSON.stringify(session));
                return json({session_id: session.id});
        }
        // Sets Endpoint 
        const match = url.pathname.match(/^\/api\/sessions\/([^\/]+)\/sets$/);
        if (req.method === "POST" && match) { 
            const session_id = match[1];
            // Check if session exists
            const raw = await env.KILO_KV.get(`session:${session_id}`);
            if (!raw) {
                return text("Session not found", 404);
            }
            const body = (await req.json()) as { exercise_name: string; weight_value: number; weight_unit: "kg" | "lb"; reps: number };
            // Validate body 
            if (typeof body.exercise_name !== "string" || body.exercise_name.trim() === "") { 
                return text("Invalid exercise_name", 400);
            }
            if (typeof body.weight_unit !== "string" || (body.weight_unit !== "kg" && body.weight_unit !== "lb")) {
                return text("Invalid weight_unit", 400);
            }
            if (typeof body.weight_value !== "number" || body.weight_value <= 0 || typeof body.reps !== "number" || body.reps <= 0) { 
                return text("Invalid weight_value or reps must be a positive number", 400);
            }
            const set: WorkoutSet = {
                id: crypto.randomUUID(),
                session_id,
                exercise_name: body.exercise_name,
                weight_value: body.weight_value,
                weight_unit: body.weight_unit,
                reps: body.reps,
                corrected: false,
                created_at: new Date().toISOString(),
            };
            await env.KILO_KV.put(`set:${set.id}`, JSON.stringify(set));
            return json({ set_id: set.id });
        }
        // Patch Session Endpoint
        const patchMatch = url.pathname.match(/^\/api\/sets\/([^\/]+)$/);
        if (req.method === "PATCH" && patchMatch) {
            const set_id = patchMatch[1];
            const raw = await env.KILO_KV.get(`set:${set_id}`);
            if (!raw) {
                return text("Set not found", 404);
            }
            const set = JSON.parse(raw) as WorkoutSet;
            const body = (await req.json()) as Partial<WorkoutSet>;
            if(typeof body.exercise_name === "string") set.exercise_name = body.exercise_name;
            if(typeof body.weight_value === "number") set.weight_value = body.weight_value;
            if(typeof body.weight_unit === "string" && (body.weight_unit === "kg" || body.weight_unit === "lb")) set.weight_unit = body.weight_unit;
            if (typeof body.reps === "number") set.reps = body.reps;
            set.corrected = true; // Mark as corrected when patched
            await env.KILO_KV.put(`set:${set.id}`, JSON.stringify(set));
            return json({ok: true});
        }

        if (req.method === "POST" && url.pathname === "/api/ai/parse") { 
            const buff = await req.arrayBuffer();
            const mimeType = req.headers.get("content-type") || "audio/webm";
            const exerciseContext = req.headers.get("x-exercise-context") || "";
            const model = env.GEMINI_MODEL || "gemini-2.5-flash";
            // DEBUG: log context header (remove later)
            console.log("[DEBUG] Exercise context:", exerciseContext);

            const result = await parseAudioWithGemini({
                apiKey: env.GEMINI_API_KEY,
                model,
                audioBuffer: buff,
                mimeType,
                exerciseContext,
            });
            // DEBUG: log Gemini output shape (remove later)
            console.log("[DEBUG] Gemini result:", JSON.stringify(result));

            return json(result);
        }
        return text("Not Found", 404);


        }
    }
