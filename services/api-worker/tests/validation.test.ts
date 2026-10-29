import { describe, it, expect } from "vitest";
import {
  validateBatchPayload,
  BatchPayloadSchema,
  SessionCreateSchema,
  SetPatchSchema,
  ParseAudioSchema,
  SyncBatchSchema,
} from "../src/validation";

describe("validateBatchPayload & Zod Schemas (Fix 2)", () => {
  it("rejects missing exercise_name", () => {
    const result = validateBatchPayload({
      sets: [{ weight_value: 100, weight_unit: "kg", reps: 10 }],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("exercise_name is required");
  });

  it("rejects empty sets array", () => {
    const result = validateBatchPayload({
      exercise_name: "Squat",
      sets: [],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("sets is required");
  });

  it("rejects invalid weight or reps", () => {
    const invalidWeight = validateBatchPayload({
      exercise_name: "Bench Press",
      sets: [{ weight_value: -5, weight_unit: "kg", reps: 10 }],
    });
    expect(invalidWeight.ok).toBe(false);

    const invalidUnit = validateBatchPayload({
      exercise_name: "Bench Press",
      sets: [{ weight_value: 100, weight_unit: "stone", reps: 10 }],
    });
    expect(invalidUnit.ok).toBe(false);

    const invalidReps = validateBatchPayload({
      exercise_name: "Bench Press",
      sets: [{ weight_value: 100, weight_unit: "kg", reps: 0 }],
    });
    expect(invalidReps.ok).toBe(false);
  });

  it("accepts valid batch payload via both wrapper and BatchPayloadSchema", () => {
    const payload = {
      exercise_name: "Squat",
      sets: [
        { weight_value: 100, weight_unit: "kg" as const, reps: 10 },
        { weight_value: 100, weight_unit: "kg" as const, reps: 8 },
      ],
    };
    const result = validateBatchPayload(payload);
    expect(result.ok).toBe(true);
    expect(BatchPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("validates SessionCreateSchema", () => {
    expect(
      SessionCreateSchema.safeParse({ user_id: "usr_1", workout_date: "2026-10-28" }).success
    ).toBe(true);
    expect(
      SessionCreateSchema.safeParse({ user_id: "  ", workout_date: "2026-10-28" }).success
    ).toBe(false);
    expect(
      SessionCreateSchema.safeParse({ user_id: "usr_1", workout_date: "not-a-date" }).success
    ).toBe(false);
  });

  it("validates SetPatchSchema and rejects empty objects", () => {
    expect(SetPatchSchema.safeParse({}).success).toBe(false);
    expect(SetPatchSchema.safeParse({ weight_value: -10 }).success).toBe(false);
    expect(SetPatchSchema.safeParse({ reps: 12, weight_value: 85 }).success).toBe(true);
  });

  it("validates ParseAudioSchema and SyncBatchSchema", () => {
    expect(ParseAudioSchema.safeParse({ audio_base64: "" }).success).toBe(false);
    expect(ParseAudioSchema.safeParse({ audio_base64: "AAAA" }).success).toBe(true);

    expect(SyncBatchSchema.safeParse({ session: {} }).success).toBe(false);
    expect(
      SyncBatchSchema.safeParse({
        session: { id: "live_123", groups: [] },
      }).success
    ).toBe(true);
  });
});
