import { z } from "zod";

export const SetItemSchema = z.object({
  weight_value: z.number().positive("weight_value must be a positive number"),
  weight_unit: z.enum(["kg", "lb"], {
    message: "weight_unit must be either kg or lb",
  }),
  reps: z.number().positive("reps must be a positive number"),
});

export const BatchPayloadSchema = z.object({
  exercise_name: z.string().min(1, "exercise_name must be a non-empty string"),
  sets: z.array(SetItemSchema).min(1, "sets must be a non-empty array"),
});

export type ValidationSetItem = z.infer<typeof SetItemSchema>;
export type ValidationBatchPayload = z.infer<typeof BatchPayloadSchema>;

export const SessionCreateSchema = z.object({
  user_id: z.string().min(1, "Invalid user_id"),
  workout_date: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Invalid workout_date",
  }),
});

export const SetPatchSchema = z.object({
  exercise_name: z.string().min(1).optional(),
  weight_value: z.number().positive().optional(),
  weight_unit: z.enum(["kg", "lb"]).optional(),
  reps: z.number().positive().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided to update"
});
