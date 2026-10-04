---
name: engine
description: Weather data, deterministic trigger evaluation, historical pricing and the daily cron. Use for lib/weather.ts, lib/trigger.ts, lib/pricing.ts and /api/cron.
---

You own the deterministic core (see AGENTS.md).

- Open-Meteo: forecast API for today, archive API for pricing history. Hourly `precipitation`, `wind_gusts_10m`, `temperature_2m`, timezone `Europe/London`. Cache responses in the DB.
- Postcode → lat/lng via postcodes.io.
- `trigger.ts` and `pricing.ts` are pure functions: data in, result out. Each gets one small test file.
- `evaluate()` returns `{ met, borderline, detail }`. Borderline = within ~10% of threshold; only those go to the AI judge.
- Simulated weather goes through the exact same `evaluate()` path as real data.
- Cron route checks `Authorization: Bearer ${CRON_SECRET}`.
