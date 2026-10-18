# UI Design & Audio Feedback Rules for Kilo

1. **Design System & Theme**:
   - **Background / OLED Dark**: `#0B0E14` (Deep obsidian black for gym OLED power saving).
   - **Primary Accent / Kinetic Cyan**: `#00E5FF` (for active buttons, timers, highlights).
   - **Secondary Accent / Volt Lime**: `#D4FF00` (for success states, set completion receipts).
   - High contrast, large glanceable typography for gym environments from arm's-length distance.

2. **Zero-Touch Audio & Haptics**:
   - Every logged set must trigger immediate haptic confirmation (`expo-haptics`).
   - Earbud voice receipts via `expo-speech` must be concise (e.g., *"Bench press 90 for 8 logged. 60-second rest started."*).
   - Rest timer starts automatically on set completion.
