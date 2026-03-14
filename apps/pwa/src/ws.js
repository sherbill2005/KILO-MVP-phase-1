export function openLiveSocket() {
  return new WebSocket("ws://127.0.0.1:8787/ws/ai/live");
}
