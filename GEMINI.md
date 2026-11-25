# Autonomous Build, Dual-Persona Gemini Review & Self-Test Protocol

Execute this loop autonomously without pausing for confirmation:
1. **Compile & Typecheck:** Run `pnpm typecheck` and `pnpm build` and fix all errors.
2. **Dual-Persona Gemini Review:** Run `node scripts/ai-review.mjs` to send the current codebase/diff to `gemini-3.8-flash` under two independent senior reviewer personas (Security/Backend Architect & Frontend/Conversion Engineer) and save both reports to `AI_REVIEW.md`.
3. **Apply Improvements:** Read `AI_REVIEW.md`, implement every valid fix or optimization, and re-run `node scripts/ai-review.mjs` once more to confirm all critical findings are resolved.
4. **Self-Test & Browser Verification:** Run Playwright tests headlessly, start the dev server, inspect `http://localhost:3000` and `http://localhost:3000/admin` via `/browser` across desktop and mobile viewports, verify zero console or network errors, and fix any UI or runtime bugs found.