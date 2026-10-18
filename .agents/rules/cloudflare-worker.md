# Cloudflare Worker & Gemini Proxy Rules

1. **Environment & Secrets**:
   - Local development uses `services/api-worker/.dev.vars` for secrets like `GEMINI_API_KEY` and `GEMINI_MODEL`.
   - Never hardcode API keys or Cloudflare tokens in source files.
   - Production secrets are set via `wrangler secret put <KEY>`.

2. **Wrangler Execution**:
   - Start worker in `services/api-worker/` with `npx wrangler dev`.
   - Ensure compatibility with Cloudflare Workers Types defined in `env.d.ts`.

3. **Gemini Live & AI Parsing**:
   - Model: Use `gemini-2.5-flash-native-audio-preview-12-2025` for Gemini Live audio proxying.
   - All AI parsing endpoints must return strict structured JSON matching the closed 35-exercise taxonomy with zero hallucination.
