import type { Env } from "../env";
import type {
  WorkoutGroup,
  WorkoutSession,
  WorkoutSet,
} from "../../../../packages/shared/types/workoutModel";
import { validateBatchPayload } from "../validation.js";

export async function logWorkout(
  env: Env,
  sessionId: string,
  workout: any[]
) {
  const raw = await env.KILO_KV.get(`session:${sessionId}`);
  if (!raw) throw new Error("Session not found");

  const session = JSON.parse(raw) as WorkoutSession;
  if (!Array.isArray(session.group_ids)) session.group_ids = [];

  const group_ids: string[] = [];
  const set_ids: string[] = [];

  for (const ex of workout) {
    const batch = {
      exercise_name: ex.exercise,
      sets: (ex.sets || []).map((s: any) => ({
        weight_value: s.weight,
        weight_unit: s.unit,
        reps: s.reps,
      })),
    };

    const validation = validateBatchPayload(batch);
    if (!validation.ok) {
      throw new Error(validation.message || "Invalid batch payload");
    }

    const group_id = crypto.randomUUID();
    const ids: string[] = [];

    for (let i = 0; i < batch.sets.length; i++) {
      const s = batch.sets[i];
      const set: WorkoutSet = {
        id: crypto.randomUUID(),
        session_id: sessionId,
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
      ids.push(set.id);
      set_ids.push(set.id);
    }

    const group: WorkoutGroup = {
      id: group_id,
      session_id: sessionId,
      exercise_name: batch.exercise_name,
      set_ids: ids,
      created_at: new Date().toISOString(),
    };

    await env.KILO_KV.put(`group:${group_id}`, JSON.stringify(group));
    group_ids.push(group_id);
  }

  session.set_ids.push(...set_ids);
  session.group_ids.push(...group_ids);
  await env.KILO_KV.put(`session:${sessionId}`, JSON.stringify(session));

  return { group_ids, set_ids };
}
