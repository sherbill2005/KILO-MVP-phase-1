export type ClientToWorkerMessage =
  | { type: "session"; session_id: string }
  | { type: "context"; exercises: string[] };

export type WorkerToClientMessage =
  | { type: "status"; value: "listening" | "processing" | "error" }
  | { type: "result"; workout: unknown[]; group_ids: string[]; set_ids: string[] };
