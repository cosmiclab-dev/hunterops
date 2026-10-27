# HunterOps v2

A job search cockpit for one person, built for iPhone first. It pulls recruiter roles in Bengaluru and remote from company career boards, scores each one against your profile (the Grill), tailors resumes in a clean Swiss layout, and writes recruiter emails that only go out after you approve them.

You always apply on the company's own site yourself. HunterOps never submits applications, never scrapes LinkedIn or Naukri, and never sends an email you have not approved.

**Stack:** Next.js 14 (App Router) · Prisma 5 · Neon Postgres · shadcn/ui + Tailwind · Vercel (with a daily cron) · any LLM API, OpenCode Go with DeepSeek by default.

## What it does

| Screen | What you do there |
| --- | --- |
| **Job Board** (`/`) | New, Saved, Applied and All tabs; Bengaluru / Remote filters; sort by best fit or newest. Every card shows a **Grill Score badge** (red under 50, yellow 50 to 74, green 75+), matched skills, and missing skills with a `?`. *Scan now* pulls fresh postings. |
| **Job page** (`/jobs/[id]`) | Status tracker and notes. Tabs: **Grill** (the score broken down), **Resume** (tailor to this job, download PDF or DOCX), **Email** (write, edit, review, approve and send), **JD**, **Slop check**. |
| **Profile** (`/profile`) | Import your resume from PDF, DOCX or TXT; the model fills the form; you check and save. Saving re-scores every job. Also holds your location rules for the Grill. |
| **Settings** (`/settings`) | AI provider, model and key; Gmail; feed keywords and locations; company boards (add any Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Recruitee or Workable careers URL). |

## The intelligence modules

All three live in `src/lib/modules/` and are plain TypeScript with no AI call, so they are fast, free and give the same answer every time.

### Module A: Anti-Slop (`anti-slop.ts`)
`BANNED_PHRASES` holds the 16 phrases you specified (delve, testament to, game-changer, landscape, fostering, tapestry, plethora, underscores, paramount, spearheaded, unwavering, digital age, meticulous, navigating, poised to, rich history). Each rule also catches other forms ("delved", "spearheading", "game changer") and skips look-alikes ("landscaped").
1. Every writing prompt (resume tailoring, emails) tells the model not to use them.
2. Every draft is scanned; if anything slips through, the draft goes back to the model once for a rewrite.
3. Whatever remains is highlighted in the app with a plainer word, and you can paste any text into the Slop check tab.

### Module D: The Grill (`grill.ts`)
| Part | Weight | How it is scored |
| --- | --- | --- |
| Skills match | 40 | Skills named in the JD's required part (from a recruiting-heavy vocabulary plus your own skills), and the share of them in your Profile skills. Whole-term matching ("java" never matches "javascript") with aliases ("TA" = "talent acquisition"). |
| Location fit | 20 | Strict. Remote: full marks only if you accept remote and the role is open to India (a "Remote - US" role scores 0). Hybrid or on-site: full marks only in one of your cities. 10 if the posting does not say. |
| Experience | 20 | Reads "5+ years", "3-6 yrs", "minimum of 8 years". Full marks at or above the minimum, partial credit down to half the minimum, slightly less if you are far above a stated band. |
| Keywords | 20 | Bonus for the JD's "nice to have" / "preferred" / "a plus" items found anywhere in your profile. If the JD has no such list, the whole JD is used. |

Scores are stored on each job with the full breakdown, recomputed when you save your profile or press Re-grill.

### Module E: The Designer (`designer.ts` + [`DESIGN.md`](DESIGN.md))
`DESIGN.md` is the Switzerland Style contract: Inter for headings and text, Roboto Mono for metadata, a 4px baseline grid, three colours (#111111, #FFFFFF, #E5E5E5), single column, 24mm margins. `designer.ts` holds the same values as tokens. The dashboard's Tailwind theme and the PDF/DOCX renderer both read them, and every tailored resume is audited against them (grid alignment, section order, page count for your years, bullet length and count) before you download it.

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

`prisma/schema.prisma`: `Profile` (one row), `Company` (boards to scan), `Job` (feed and tracker in one table, with `grillScore` and `grillBreakdown`), `Resume` (tailored copies, with their Anti-Slop score), `Contact`, `Email` (DRAFT → APPROVED → SENT or FAILED), `ScanRun`, `Setting`. Migrations are in `prisma/migrations` and run on every Vercel build.

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

`npm run e2e` resets the database in `.env.e2e`, builds the app, starts a mock OpenAI-compatible model server and a local SMTP server, then runs 25 API checks (login, encrypted keys, PDF import, Grill bands, filters, tailoring with the Anti-Slop rewrite, PDF/DOCX download, approve-then-send, daily cap, cron auth) and an iPhone-size browser pass with screenshots. `.env.e2e` looks like:

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
