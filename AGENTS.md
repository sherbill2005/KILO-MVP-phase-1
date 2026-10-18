# KILO Development

Kilo is a voice-first, zero-touch workout tracking system consisting of:
- `apps/mobile/`: Expo SDK 57 React Native offline-first mobile app with SQLite, Haptics, and Speech.
- `services/api-worker/`: Cloudflare Worker handling Gemini Live audio WebSocket streaming and intent parsing.

## Key Developer Rules
- Always use `npx expo install` for mobile dependencies.
- Keep data persistence offline-first with `expo-sqlite`.
- Maintain the OLED Gym Dark theme (`#0B0E14`, Cyan `#00E5FF`, Volt Lime `#D4FF00`).
- Use `credentials.txt` for reference keys and `.dev.vars` for local worker execution.
