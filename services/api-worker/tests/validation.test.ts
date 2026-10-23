import { describe, it, expect } from "vitest";
import { BatchPayloadSchema } from "../src/validation";

describe("BatchPayloadSchema", () => {
  it("rejects missing exercise_name", () => {
    const result = BatchPayloadSchema.safeParse({
      sets: [{ weight_value: 100, weight_unit: "kg", reps: 10 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty sets array", () => {
    const result = BatchPayloadSchema.safeParse({
      exercise_name: "Squat",
      sets: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid weight or reps", () => {
    const invalidWeight = BatchPayloadSchema.safeParse({
      exercise_name: "Bench Press",
      sets: [{ weight_value: -5, weight_unit: "kg", reps: 10 }],
    });
    expect(invalidWeight.success).toBe(false);

    const invalidUnit = BatchPayloadSchema.safeParse({
      exercise_name: "Bench Press",
      sets: [{ weight_value: 100, weight_unit: "stone" as any, reps: 10 }],
    });
    expect(invalidUnit.success).toBe(false);

    const invalidReps = BatchPayloadSchema.safeParse({
      exercise_name: "Bench Press",
      sets: [{ weight_value: 100, weight_unit: "kg", reps: 0 }],
    });
    expect(invalidReps.success).toBe(false);
  });

  it("accepts valid batch payload", () => {
    const result = BatchPayloadSchema.safeParse({
      exercise_name: "Squat",
      sets: [
        { weight_value: 100, weight_unit: "kg", reps: 10 },
        { weight_value: 100, weight_unit: "kg", reps: 8 },
      ],
    });
    expect(result.success).toBe(true);
  });
});
