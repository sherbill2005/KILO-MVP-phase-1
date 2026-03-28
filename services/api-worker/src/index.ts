import type { WorkoutSession, WorkoutSet, WorkoutGroup } from "../../../packages/shared/types/workoutModel";  
import { validateBatchPayload } from "./validation.js";    
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
                    group_ids: [],
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
            const body = (await req.json()) as any;
            const batch = Array.isArray(body.sets) ? body : {
                exercise_name: body.exercise_name,
                sets: [{
                    weight_value: body.weight_value,
                    weight_unit: body.weight_unit,
                    reps: body.reps,
                }]
            };

            // Validate body 
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
                set_ids: set_ids,
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
       
        if (req.method === "GET" && url.pathname === "/ws/ai/live") {
            // This is a placeholder for the WebSocket endpoint. Implementing a full WebSocket server in a Cloudflare Worker is non-trivial and may require using Durable Objects or an external service. For now, we can return a 501 Not Implemented status.
            return handleLiveWs(req, env);
         
        }
         return text("Not Found", 404);



        }
    }
