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

export function validateBatchPayload(body: ValidationBatchPayload): ValidationResult {
  if (!body || typeof body.exercise_name !== "string" || body.exercise_name.trim() === "") {
    return { ok: false, message: "exercise_name is required and must be a non-empty string" };
  }
  if (!Array.isArray(body.sets) || body.sets.length === 0) {
    return { ok: false, message: "sets is required and must be a non-empty array" };
  }
  for (const s of body.sets) {
    if (typeof s.weight_value !== "number" || s.weight_value <= 0) {
      return { ok: false, message: "weight_value is required and must be a positive number" };
    }
    if (s.weight_unit !== "kg" && s.weight_unit !== "lb") {
      return { ok: false, message: "weight_unit is required and must be either kg or lb" };
    }
    if (typeof s.reps !== "number" || s.reps <= 0) {
      return { ok: false, message: "reps is required and must be a positive number" };
    }
  }
  return { ok: true };
}
