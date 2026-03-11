export type WorkoutSession = {
    id: string;
    user_id: string;
    workout_date: string;
    set_ids: string[];
    finished: boolean;

 }

export type WorkoutSet = {
    id: string;
    session_id: string;
    exercise_name: string;
    weight_value: number;
    weight_unit: "kg" | "lb";
    reps: number;
    corrected: boolean;
    created_at: string;

}
