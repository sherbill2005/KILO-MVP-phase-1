

export function openLiveSocket() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = "127.0.0.1:8787";
    return new WebSocket(`${protocol}://${host}/ws/ai/live`);
}
