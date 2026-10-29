import { z } from "zod";

export const SetItemSchema = z.object({
  weight_value: z.number({
    required_error: "weight_value is required and must be a positive number",
    invalid_type_error: "weight_value is required and must be a positive number",
  }).positive("weight_value is required and must be a positive number"),
  weight_unit: z.enum(["kg", "lb"], {
    message: "weight_unit is required and must be either kg or lb",
  }),
  reps: z.number({
    required_error: "reps is required and must be a positive number",
    invalid_type_error: "reps is required and must be a positive number",
  }).positive("reps is required and must be a positive number"),
});

export const BatchPayloadSchema = z.object({
  exercise_name: z.string({
    required_error: "exercise_name is required and must be a non-empty string",
    invalid_type_error: "exercise_name is required and must be a non-empty string",
  }).trim().min(1, "exercise_name is required and must be a non-empty string"),
  sets: z.array(SetItemSchema, {
    required_error: "sets is required and must be a non-empty array",
    invalid_type_error: "sets is required and must be a non-empty array",
  }).min(1, "sets is required and must be a non-empty array"),
});

export const SessionCreateSchema = z.object({
  user_id: z.string({
    required_error: "Invalid user_id",
    invalid_type_error: "Invalid user_id",
  }).trim().min(1, "Invalid user_id"),
  workout_date: z.string({
    required_error: "Invalid workout_date",
    invalid_type_error: "Invalid workout_date",
  }).refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid workout_date",
  }),
});

export const SetPatchSchema = z.object({
  exercise_name: z.string().trim().min(1, "exercise_name must be a non-empty string").optional(),
  weight_value: z.number().positive("weight_value must be a positive number").optional(),
  weight_unit: z.enum(["kg", "lb"]).optional(),
  reps: z.number().positive("reps must be a positive number").optional(),
}).refine(
  (data) =>
    data.exercise_name !== undefined ||
    data.weight_value !== undefined ||
    data.weight_unit !== undefined ||
    data.reps !== undefined,
  {
    message: "At least one valid field must be provided to update",
  }
);

export const ParseAudioSchema = z.object({
  audio_base64: z.string().trim().min(1, "Missing audio_base64"),
  mime_type: z.string().optional(),
  exercises: z.array(z.string()).optional(),
  session_id: z.string().optional(),
});

export const SyncBatchSchema = z.object({
  session: z.object({
    id: z.string().trim().min(1, "Missing session.id"),
    userId: z.string().optional(),
    user_id: z.string().optional(),
    workoutDate: z.string().optional(),
    workout_date: z.string().optional(),
    startedAt: z.number().optional(),
    started_at: z.number().optional(),
    finishedAt: z.number().nullable().optional(),
    finished_at: z.union([z.number(), z.string()]).nullable().optional(),
    mode: z.string().optional(),
    groups: z.array(z.any()).optional(),
  }),
});

export interface ValidationSetItem {
  weight_value?: number;
  weight_unit?: string;
  reps?: number;
}

export interface ValidationBatchPayload {
  exercise_name?: string;
  sets?: ValidationSetItem[];
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

/**
 * Backward-compatible validator function powered by BatchPayloadSchema
 */
export function validateBatchPayload(body: ValidationBatchPayload): ValidationResult {
  const parsed = BatchPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || "Invalid batch payload",
    };
  }
  return { ok: true };
}
