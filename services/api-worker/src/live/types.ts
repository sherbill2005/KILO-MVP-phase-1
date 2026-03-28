export type ClientToWorkerMessage =
    | { type: "ping" }
    | { type: "session"; session_id: string }
    | { type: "context"; exercises: string[] }
    | { type: "stop" };

export type WorkerToClientMessage =
    | { type: "pong" }
    | { type: "ack" }
    | { type: "ack_context" }
    | { type: "status"; value: "listening" | "processing" | "error" | "no_match"}
    | {
        type: "result";
        workout: unknown[];
        group_ids: string[];
        set_ids: string[];
        transcript?: string;
    };
