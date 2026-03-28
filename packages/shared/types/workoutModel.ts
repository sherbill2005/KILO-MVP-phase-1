export type WorkoutSession = {
    id: string;
    user_id: string;
    workout_date: string;
    group_ids: string[];
    set_ids: string[];
    finished: boolean;

 }

export type WorkoutSet = {
    id: string;
    session_id: string;
    group_id: string;
    group_index: number;
    exercise_name: string;
    weight_value: number;
    weight_unit: "kg" | "lb";
    reps: number;
    corrected: boolean;
    created_at: string;

}
export type WorkoutGroup = {
    id: string;
    session_id: string;
    set_ids: string[];
    exercise_name: string;
    created_at: string;

}