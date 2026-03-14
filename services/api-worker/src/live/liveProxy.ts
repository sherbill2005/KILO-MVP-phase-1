import type { Env } from "../env";
import type { WorkerToClientMessage } from "./types";

export async function handleLiveWs(req: Request, env: Env): Promise<Response> {
  const pair = new WebSocketPair();
  const client = pair[0];
  const worker = pair[1];
  worker.accept();

  worker.send(
    JSON.stringify({
      type: "status",
      value: "listening",
    } satisfies WorkerToClientMessage)
  );

  return new Response(null, { status: 101, webSocket: client });
}
