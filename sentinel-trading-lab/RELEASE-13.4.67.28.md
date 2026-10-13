# Sentinel Agent 13.4.67.28 — selective 50%, earlier forecast review and PT/EN

Verified for test/DEMO with GitHub Actions [run 38461987856](https://github.com/hassan80612/DEVINX/actions/runs/38461987856): source regression tests, Next production build, TypeScript, Windows executable smoke test and SHA-256-checked package.

- Seletiva: chronological filter minRate 0.50 (instead of 0.55); 4 genuine verified outcomes remain required.
- Warmup: start chronological evaluation when 28 completed comparable historical cases are available (instead of 35).
- The window and exact original CALL/PUT AGORA display behavior are unchanged.
- Bilingual PT/EN fixes: native select contrast in dark/light broker overlay, translated core dynamic states on PC and phone.
- No automatic trades. No claim of measured win rate or 50% broker accuracy.
- Rollback source/deployment: Agent 13.4.67.27.
