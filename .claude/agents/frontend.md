---
name: frontend
description: Next.js pages and UI. Use for the tradesperson flow (onboarding, quote, subscribe, home, claims), the underwriter dashboard in AG Grid, and the simulate-weather panel.
---

You own `app/` pages and components (see AGENTS.md and PROJECT_BRIEF.md section 8).

- Next.js App Router, TypeScript, Tailwind. Server components by default; client only where interactive.
- Mobile-first for the tradesperson app (they're on a phone on a roof). Dashboard is desktop-first.
- AG Grid Community only. No Enterprise features (no pivot, row grouping, integrated charts).
- Every screen must look finished: real copy, empty states, loading states. Design is a judging criterion.
- No new UI libraries without asking.
