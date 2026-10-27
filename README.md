# HunterOps v2

A job search cockpit for one person, built for iPhone first. It pulls recruiter roles in Bengaluru and remote from company career boards, scores each one against your profile (the Grill), tailors resumes in a clean Swiss layout, and writes recruiter emails that only go out after you approve them.

You always apply on the company's own site yourself. HunterOps never submits applications, never scrapes LinkedIn or Naukri, and never sends an email you have not approved.

**Stack:** Next.js 14 (App Router) · Prisma 5 · Neon Postgres · shadcn/ui + Tailwind · Vercel (with a daily cron) · any LLM API, OpenCode Go with DeepSeek by default.

## What it does

Everything happens inside the app. A fixed left sidebar on laptops (Discover, Pipeline, Browser, Mailroom, plus All jobs, Profile and Settings) and a five-tab bar on iPhone.

| Screen | What you do there |
| --- | --- |
| **Home** (`/`) | Setup steps until you're ready (upload your CV, AI key, pay and notice, search key, first scan), then the 31 December goal countdown, stat tiles, fresh jobs, pipeline split, 14-day chart, follow-ups and quick actions. |
| **Discover** (`/discover`) | Pick role titles, location and window (24h, 48h, week). **Web X-Ray** runs one search per ATS (Greenhouse, Ashby, Lever, SmartRecruiters, Workday) through the Serper or Brave search API with your key, and shows the results in the app: *Open* loads the posting in the Browser, *Add* saves and grills it. **In HunterOps** shows fresh matches the scanner already pulled. **People hiring** lists TA leaders. No Google pages are opened. |
| **Pipeline** (`/pipeline`) | dnd-kit Kanban: **Scouted**, **Grilled 75+**, **Applied** (with Applied / Interview / Offer sub-stages) and **Rejected**. Drag on a laptop; on iPhone use the *Move to…* menu. |
| **Browser** (`/browser`, `/browser/[jobId]`) | The posting is fetched by the server (an SSRF-guarded proxy) and shown as a sanitized **Reader** view, the **Live page** when the site allows framing, or Greenhouse's official **Apply form**. The control panel on the right has **Analyze** (Grill this page), **Auto-fill** (an answer for every field on the application form from your profile, with AI for open questions, each with a copy button), **Resume** and **Cover letter**. You submit the form yourself. |
| **Mailroom** (`/mailroom`) | **Emails** (any job, or type a company), **LinkedIn & referrals** (three scripts under 60 words), **Gap scripts**, **Follow-ups** (log with 5-day reminders) and **Plain English** (ASD-STE100 rewrite). |
| **Job page** (`/jobs/[id]`) | Grill card (radial gauge, the four dimensions, missing keywords as red badges, *Generate resume*), status and notes, and tabs for Description, Resume, Cover letter (AIDA or PAS), Email and Slop check. |
| **Profile** / **Settings** | CV import, pay and notice period, location rules, CV roaster. Theme, AI provider, Gmail, web search key, extra banned words, feed keywords, company boards. |

Other sites' application forms can't be filled from another site's page (browsers block that), and HunterOps never submits for you. Auto-fill gives you every answer ready to copy instead.

## The intelligence modules

All in `src/lib/`. The Grill, Anti-Slop scan and Designer audit are plain TypeScript with no AI call.

### Module A: Anti-Slop (`modules/anti-slop.ts`, `writer.ts`)
`BANNED_PHRASES` plus any extra words you add in Settings. `scanForSlop(text)` returns `{ hasSlop, findings }`. Every AI draft goes through `writeClean`: draft, one rewrite if a banned phrase slipped in, safe word swaps, and if anything still remains the draft is rejected with *"Draft rejected due to low-quality AI patterns: …"* instead of being shown.

### Module B: Email generator (`email-generator.ts`)
`SYSTEM_PROMPTS.AIDA` and `SYSTEM_PROMPTS.PAS`, picked by the `framework` parameter. `POST /api/draft-email { jobId, framework }` writes a cover letter, runs it through Anti-Slop and saves it on the job's `Artifact` row (and as an email draft when you give a recipient).

### Module C: Plain English (`ste100.ts`)
`refineToPlainEnglish(text)` sends: *"Rewrite the following text adhering to ASD-STE100 Simplified Technical English rules. One idea per sentence. Use active voice. Remove all jargon."* `POST /api/refine`.

### Module D: The Grill (`modules/grill.ts`)
| Part | Weight | How it is scored |
| --- | --- | --- |
| Hard skills | 40 | 30 for the JD's required skills found in your profile, 10 for nice-to-haves. Whole-term matching with aliases; naming any ATS counts as ATS experience. |
| Years of experience | 20 | Reads "5+ years", "3-6 yrs". Full marks at or above the minimum. |
| Location fit | 20 | Strict: remote only if open to India; hybrid or on-site only in your cities. |
| Salary fit | 20 | Pay read from the posting (LPA, lakh, crore, USD and monthly figures converted) against your expected CTC. Half marks when either is missing. |

The full result (score, band, each dimension, `missingKeywords`) is saved as JSON on the job. `POST /api/grill { url }` scores any link; `{ jobId }` re-reads and re-scores a saved job.

### Module E: The Designer (`modules/designer.ts` + [`DESIGN.md`](DESIGN.md))
`validateLayout(stats)` checks page overflow, heading hierarchy (section order), margins and the 4px grid; every tailored resume is checked before download.

## AI providers (pluggable)

```
                      ┌────────────────────────── Settings (encrypted in Neon) ─┐
 resume import  ─┐    │ provider · model · key · base URL (custom only)         │
 resume tailor  ─┼──▶ llmConfig() ──▶ chat() ──┬─▶ "openai" wire format  ──▶ OpenCode Go (default: deepseek-v4.1-flash)
 email writer   ─┘                             │                         ──▶ OpenAI · Gemini · OpenRouter · Groq
                                               │                         ──▶ Custom: Together, Fireworks, Mistral, DeepSeek, vLLM, Ollama…
                                               └─▶ "anthropic" format    ──▶ Anthropic (Claude)
                         writer.ts: chatJson() ─▶ Anti-Slop scan ─▶ one rewrite if needed ─▶ app
```

- **Registry:** `src/lib/llm/providers.ts`. Each provider is one entry: label, wire format, base URL, default model, suggested models, env var for a fallback key. Adding a provider is one entry; nothing else changes.
- **Client:** `src/lib/llm/client.ts`. `llmConfig(settings)` resolves provider, key, model and endpoint; `chat()` speaks either the OpenAI chat-completions format (Bearer key) or the Anthropic Messages format (`x-api-key`). It retries once without `response_format` or `temperature` if a model rejects them, and turns HTTP errors into plain messages ("rejected the API key", "usage limit reached").
- **Default:** OpenCode Go, `https://opencode.ai/inference/go/openai/v1/chat/completions`, model `deepseek-v4.1-flash` (switch to `deepseek-v4-pro` in Settings for harder tailoring).
- **Keys:** pasted in Settings, encrypted with AES-256-GCM using `APP_SECRET`, never sent back to the browser (Settings shows `sk-••••abcd`). Each provider keeps its own key, so you can switch back and forth. Env vars work as a fallback.
- **Test connection** sends a one-word round trip with the values in the form before you save them.

## Data model

`prisma/schema.prisma`: `Profile` (one row), `Company` (boards to scan), `Job` (feed and tracker in one table: `url`, `description`, `status`, `grillScore` and `grillBreakdown`), `Artifact` (per job: `coverLetterText`, `resumePdfPath`, `emailDrafts` JSON, Auto-fill answers), `Resume` (tailored copies, with their Anti-Slop score), `Contact`, `Email` (DRAFT → APPROVED → SENT or FAILED), `Outreach` (LinkedIn DMs and referral asks you send yourself, with follow-up dates), `ScanRun`, `Setting` (config, including the extra banned words). Migrations are in `prisma/migrations` and run on every Vercel build.

## Email safety

- A draft is only sent by `POST /api/emails/[id]/send` with `approve: true` **and** the exact subject and body you reviewed; if the draft changed since, it refuses.
- The draft is claimed atomically before sending, so a double tap cannot send twice. Sent emails cannot be edited or deleted.
- A daily cap (default 20, in Settings) limits sends in any 24 hours.
- Gmail uses an app password over SMTP; nothing else can send.

## Job sources

Company ATS boards via their public JSON APIs: Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Recruitee, Workable (31 boards seeded, add more in Settings). Plus Remotive, RemoteOK, Himalayas, and Adzuna India if you add a free Adzuna key. Titles are matched against your role keywords; locations are sorted into Bengaluru, Remote (India/APAC), Remote (anywhere), elsewhere in India and Remote (other regions). A Vercel Cron runs the scan daily at 08:00 IST.

## Run it locally

```bash
npm install
cp .env.example .env          # fill DATABASE_URL, DIRECT_URL, APP_SECRET
npx prisma migrate deploy
npm run dev                   # http://localhost:3000
```

## Tests

```bash
npm test          # unit tests: Anti-Slop, Grill, scanner, renderer + Designer audit, provider layer
npm run e2e       # end to end (needs a throwaway Postgres in .env.e2e and Playwright)
```

`npm run e2e` resets the database in `.env.e2e`, builds the app and starts stand-ins for the outside world (a mock OpenAI-compatible model, an SMTP sink, and a mock web with the Serper search API, Greenhouse and Lever job APIs and two careers pages). It then runs 44 API checks (login, encrypted keys, CV import, Grill bands and salary fit, Grill a URL, job import, the Browser proxy and sanitizer, Auto-fill, AIDA/PAS cover letters, plain English, banned words, in-app Discover, approve-then-send, daily cap, cron auth) and a browser pass at laptop width and iPhone size (sidebar, Discover, a real Kanban drag, Browser tools, Mailroom, dark theme, no sideways scroll) with screenshots. `.env.e2e` looks like:

```
DATABASE_URL=postgresql://postgres:pg@localhost:5432/hunterops
DIRECT_URL=postgresql://postgres:pg@localhost:5432/hunterops
APP_SECRET=any-32-plus-character-test-secret-value
APP_PASSWORD=letmein
CRON_SECRET=cronsecret
SMTP_HOST=127.0.0.1
SMTP_PORT=2525
```

## Deploy (Vercel + Neon)

1. Import the repo in Vercel (framework: Next.js).
2. Set `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `APP_SECRET`, `APP_PASSWORD`, `CRON_SECRET`.
3. Deploy. The build runs the migrations.
4. Open the site on your iPhone, sign in, then Share → Add to Home Screen.
5. Settings: paste your OpenCode Go key (Test connection, Save), add Gmail. Profile: import your resume. Board: Scan now.

## Credits

- Grill keyword matching follows the whole-term approach in [srbhr/Resume-Matcher](https://github.com/srbhr/Resume-Matcher) (Apache-2.0). No code was copied.
- Resume section order and ATS rules are informed by [zapplyjobs/resume-samples-2026](https://github.com/zapplyjobs/resume-samples-2026). That repo has no license, so nothing from it is included.
