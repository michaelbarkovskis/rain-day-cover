# Rain-Day Cover: PayPal AI Hackathon Project Brief

Working name: TBD. Rename freely.

Parametric income cover for self-employed tradespeople. When weather stops work, the payout lands in PayPal the same day. No claim forms.

---

## 1. Hackathon essentials

- **Hackathon:** PayPal AI Hackathon on Devpost (paypalaihackathon.devpost.com)
- **Submission deadline:** 12 Nov 2026, 12pm PT = **8pm UK**. Target submitting **11 Nov**.
- **Judging:** 1 to 15 Dec 2026. The demo must still work then.
- **Winners:** around 21 Dec 2026.
- **Core rule:** must meaningfully use the PayPal developer platform (sandbox) AND an AI tool. PayPal must be central, not a bolt-on.

### Submission checklist (miss one and you're out)

- [ ] Public GitHub repo
- [ ] Open source licence file (MIT), visible in the repo's About section
- [ ] Working build: hosted URL and/or complete local setup instructions
- [ ] README with setup steps, env vars, sandbox test logins and test credentials
- [ ] Text description of features and functionality
- [ ] Demo video under 3 minutes, public on YouTube, no copyrighted music or third-party trademarks
- [ ] Everything in English

### Judging criteria (equally weighted)

1. **Technical implementation.** How thoroughly PayPal and AI are used. Non-trivial, working. Also the first tie-breaker.
2. **Design.** A complete, coherent product, not a proof of concept.
3. **Potential impact.** A credible, specific real problem for a real audience, proven by what's demonstrated.
4. **Innovation.** Novel and different from existing concepts.
5. **Presentation.** Video shows it working end to end. Clear problem, user, why it matters.

Notes:
- Judges may not run the app. The video and description carry most of the weight.
- Judging may use automated AI analysis. Keep the README and description clear, structured and explicit about which PayPal APIs are used and why.

### Prizes to target

- Grand prizes ($12k / $8k / $5k)
- Honourable: **Most Impactful**, **Best Use of PayPal + AI**
- Sponsor: **AG Grid** (1st $5k, 2nd $2k, 3rd $1k x3)
- Max one grand OR honourable prize, plus one sponsor prize.

### Webinars (UK time)

- 6 Oct, 5pm: Start building with PayPal (attend)
- 7 Oct, 5pm: APIMatic context plugins (optional)
- 12 Oct, 3pm: Payments dashboard (useful for AG Grid)
- 13 Oct, 9am: Repeat of PayPal intro

---

## 2. The product

### Problem

Self-employed outdoor tradespeople (roofers, scaffolders, landscapers, window cleaners, painters) lose income when weather stops work. There's no damage, so normal insurance doesn't cover it. The loss is too small and frequent for a claim form. Parametric cover pays automatically when a measurable condition is met.

### Primary user

One persona, go deep. Example: a self-employed roofer in Surrey losing roughly £200 per day when rain stops work.

Lead with roofers and scaffolders. Their work genuinely stops. Validate with real tradespeople (see section 9).

### One-line pitch

"Rain-day income cover for tradespeople. If the weather stops your work, you're paid in PayPal the same day."

### Core user flow

1. Sign up, pick trade, set work postcode and usual hours.
2. Describe your work in plain English. AI turns it into a structured trigger.
3. See a quote with a plain-English explanation of the odds.
4. Subscribe monthly with PayPal Subscriptions.
5. System checks weather data for each working day.
6. Trigger met: AI agent validates, sends payout via PayPal Payouts, explains why.
7. User sees history of covered days, payouts and premiums.

### Plan shape (starting assumptions, adjust after user research)

- Monthly subscription.
- Fixed payout per qualifying weather day (e.g. £60).
- Cap on payout days per month (e.g. 4).
- Price = expected qualifying days x payout x (1 + margin), from historical data.

### Trade-specific triggers (assumptions to validate)

| Trade | Main trigger | Example threshold |
|---|---|---|
| Roofer | Rain | Rain for 2+ hours in working hours |
| Scaffolder | Wind | Gusts above a set speed in working hours |
| Painter (exterior) | Rain / humidity / cold | Rain or temp below a set level |
| Landscaper | Heavy rain | Higher rain threshold than roofers |
| Window cleaner | Rain | Rain for most of the working day |

This nuance is where the AI earns its place. Build roofers first. Others can follow if time allows.

---

## 3. Who pays the claims (money model)

Not real insurance. Frame the prototype as a front end a licensed insurer or underwriter would run behind (MGA model). Say this in the pitch.

- Premiums go into a **pool account** (PayPal sandbox business account).
- Claims are paid from the pool via **PayPal Payouts**.
- An **underwriter dashboard** shows pool balance, live policies, exposure by postcode and day, claims, and worst-case loss.
- Real-world note for the pitch: real insurance is FCA regulated. This is a prototype of the customer and risk layer.

Secondary story (one line in the pitch only): the same engine could let small businesses offer weather guarantees to customers.

---

## 4. Where AI earns its place

Judges will mark down AI that an if-statement could replace. Give it four real jobs.

1. **Policy builder.** Plain-English description to a structured trigger (location, hours, weather variable, threshold, duration). Output strict JSON.
2. **Pricer and explainer.** Uses historical weather data to estimate qualifying days. Explains the price and odds in plain English.
3. **Claims judge.** Deterministic code evaluates the trigger first. AI handles borderline cases (rain stopped at 2:05, gust just under threshold) and writes a clear explanation either way.
4. **Risk manager.** Watches pool exposure. Caps new policies in concentrated postcodes and days, adjusts prices as exposure builds, warns the underwriter.

### Guardrails

- Trigger evaluation and payout limits are enforced in code. AI never moves money outside hard limits.
- AI outputs are validated against a schema before use.
- Every AI decision is logged with its reasoning for the dashboard.

---

## 5. PayPal integration

| Feature | Use |
|---|---|
| Subscriptions | Monthly premium |
| Payouts | Claim payments to tradespeople |
| Webhooks | Subscription status, payment failures, payout status |
| Agent Toolkit / MCP server | AI agent calls PayPal itself to send the payout once a claim is valid |
| Checkout (optional) | One-off cover for a single forecast day |

**Week 1 priority:** confirm Subscriptions and Payouts both work in sandbox. If Payouts is restricted, find out now.

Resources:
- https://developer.paypal.com/api/rest/
- https://developer.paypal.com/platforms/subscriptions
- https://developer.paypal.com/docs/payouts/
- https://developer.paypal.com/api/webhooks/overview
- https://github.com/paypal/AI-Toolkit
- https://docs.paypal.ai/developer/tools/ai/agent-toolkit-quickstart
- https://docs.paypal.ai/developer/tools/ai/mcp-quickstart
- https://github.com/paypaldev/getting-started-with-paypal-sandbox

---

## 6. Suggested stack (keep costs near zero)

| Layer | Choice | Cost |
|---|---|---|
| Frontend | Next.js + React | Free |
| Backend / DB / auth | Supabase | Free tier |
| Hosting | Render (sponsor) or Vercel | Free tier |
| Weather data | Open-Meteo (forecast + historical, no key) | Free |
| AI | Claude or OpenAI, small model for parsing. Gemini free tier as fallback | A few pounds |
| Dashboard tables | AG Grid (sponsor prize) | Free community edition |
| Payments | PayPal sandbox | Free |

Cost tips:
- Cache weather data.
- Small model for structured parsing, bigger model only for explanations if needed.
- Add a "simulate weather" demo control instead of waiting for real rain.

### Keep-alive for judging (Dec 1 to 15)

- Supabase free projects pause after about a week of inactivity.
- Render free services sleep when idle.
- Set up a scheduled ping, or upgrade briefly in December, or make local setup bulletproof.

---

## 7. Draft data model

- **users**: id, name, email, paypal_email, trade, postcode, lat, lng, work_hours
- **policies**: id, user_id, trigger_json, payout_amount, max_days_per_month, monthly_premium, status, paypal_subscription_id, created_at
- **weather_checks**: id, policy_id, date, raw_data_json, trigger_met (bool), borderline (bool)
- **claims**: id, policy_id, date, decision, ai_explanation, payout_amount, paypal_payout_id, status
- **pool**: id, balance, total_exposure, updated_at
- **ai_decisions_log**: id, type, input_json, output_json, reasoning, created_at

---

## 8. Screens

**Tradesperson app**
- Onboarding (trade, postcode, hours)
- Describe your work (AI policy builder)
- Quote with explanation
- Subscribe (PayPal)
- Home: today's forecast, cover status, this month's covered days
- Claims history with AI explanations

**Underwriter dashboard (AG Grid)**
- Live policies
- Exposure by postcode and date
- Claims log
- Pool balance and worst-case loss
- AI risk alerts

**Demo controls**
- "Simulate weather" panel to force a trigger on a chosen day

---

## 9. User research (do this early)

Message 5 to 10 roofers, scaffolders or other outdoor trades. Ask:
- What does a rain day actually cost you?
- Does rain mean zero income, or just a reshuffled week?
- How many days did you lose last winter?
- Would you pay a monthly amount to get paid on those days? How much?

Use real quotes (with permission) in the video. If rain days are just reshuffled for some trades, focus on the ones whose work truly stops.

---

## 10. Demo video plan (under 3 minutes)

1. **0:00 to 0:20.** The problem. One tradesperson, one real number.
2. **0:20 to 1:10.** Sign up, describe work, AI builds policy, quote explained, subscribe with PayPal.
3. **1:10 to 1:50.** Simulate rain. AI judges the day, agent sends payout, money lands in sandbox PayPal.
4. **1:50 to 2:30.** Underwriter dashboard: exposure, pool, AI risk alert, a borderline claim explained.
5. **2:30 to 2:55.** Why it matters, who it's for, what's next.

No copyrighted music. Show it working on the real device.

---

## 11. Timeline (3 Oct to 11 Nov)

**Week 1 (3 to 11 Oct): Foundations**
- Repo, MIT licence, Next.js + Supabase setup
- PayPal sandbox: test Subscriptions and Payouts end to end
- Open-Meteo forecast and historical calls working
- Attend 6 Oct webinar
- Start messaging tradespeople

**Week 2 (12 to 18 Oct): Policy and pricing**
- Data model
- Onboarding flow
- AI policy builder with schema validation
- Pricing from historical data plus AI explanation

**Week 3 (19 to 25 Oct): Money in, triggers**
- PayPal Subscriptions checkout
- Webhooks
- Daily trigger engine (deterministic) plus scheduler
- Demo "simulate weather" control

**Week 4 (26 Oct to 1 Nov): Claims and dashboard**
- AI claims judge for borderline cases
- Agent Toolkit / MCP payout flow with hard limits
- Underwriter dashboard in AG Grid
- AI risk manager alerts

**Week 5 (2 to 8 Nov): Polish and deploy**
- Design pass across every screen
- Deploy, keep-alive set up
- README, setup instructions, test logins
- Devpost description draft

**Week 6 (9 to 11 Nov): Ship**
- Record and edit video
- Final checks against submission checklist
- Submit 11 Nov

---

## 12. Out of scope

- Real money, real insurers, real regulation
- Multiple countries or currencies
- Every trade at launch (roofers first)
- Native mobile app (responsive web is enough)
- More than one sponsor tool for prizes

## 13. Open questions

- Final product name
- Which AI provider
- Payout amount and monthly cap after user research
- Whether wind cover for scaffolders makes the cut
