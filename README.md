# HunterOps: Recruiter Command Center

A zero-cost job-hunt cockpit for a Senior Recruiter targeting Bengaluru or remote TA roles.

| Tab | What it does |
| --- | --- |
| 01 Discovery | One-click Google X-ray searches across Greenhouse, Ashby, Lever, SmartRecruiters, Workday, SuccessFactors, Darwinbox, Keka and Zoho Recruit, with the freshness filter (`&tbs=qdr:d`, `qdr:d2` or `qdr:w`) baked into the URL. Hiring-manager radar for LinkedIn "we're hiring" posts and GCC TA leads. Quick "Add to pipeline" form with ATS auto-detection. |
| 02 Pipeline | Kanban board or table, live from Neon. Filter by status, search, drag cards between columns or change status in line. Notes, delete, and "Draft" to jump to outreach with the lead pre-filled. |
| 03 Metric Roaster | Paste Capgemini bullets. DeepSeek flags weak phrasing, shows "Fluffy operational duty" next to "Enterprise scaled metric", writes 5 hardened metrics (time to fill, direct-sourcing ratio, offer-to-join, stakeholder management, agency cost savings) and a two-sentence 0-day-notice pitch. One-click copy everywhere. |
| 04 Outreach | Company, recipient title and req details in; Head of TA, Peer Referral and Practice Head messages out, each under 60 words with a live word count. Copy, then save to the Neon outreach log (optionally moving the lead to Contacted). |

The AI never invents numbers. Anything it can't take from your own text comes back as an orange `[X]` slot for you to fill with a figure you can defend.

## Stack

- **Frontend:** `public/`: plain HTML, CSS and ES modules. No build step.
- **API:** `netlify/functions/` (Netlify Functions v2, Node 20, ES modules), bundled with esbuild.
  - `db.js`: `/api/jobs`, `/api/jobs/:id`, `/api/outreach`, `/api/health` on Neon via `@neondatabase/serverless` (HTTP driver, no connection pool).
  - `ai-brain.js`: `/api/ai` with `action: "audit_profile"` or `"generate_outreach"`, proxied to OpenCode Go.
- **Database:** Neon serverless Postgres, schema in `db/schema.sql`.
- **AI:** OpenCode Go, OpenAI-compatible chat completions, default model `deepseek-v4.1-flash`.

```
hunterops/
├── netlify.toml            build settings, /api/* rewrites, security headers
├── package.json
├── .env.example
├── db/schema.sql           tables, constraints, indexes (idempotent)
├── scripts/migrate.mjs     runs schema.sql against DATABASE_URL
├── netlify/
│   ├── functions/
│   │   ├── db.js           jobs + outreach REST API
│   │   └── ai-brain.js     OpenCode Go / DeepSeek proxy
│   └── lib/                shared helpers (http, ats detection, prompts, models)
├── public/
│   ├── index.html
│   ├── favicon.svg
│   ├── css/styles.css
│   └── js/                 app, api, store, xray, pipeline, roaster, outreach, dom, ats
└── test/                   node:test suites (functions against real Postgres + fake AI)
```

## API

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/api/jobs` | `?status=contacted` (optional) | Newest first, with `outreach_count` |
| POST | `/api/jobs` | `{ title, company, url, location?, notes?, ats_type?, status? }` | `ats_type` detected from URL if omitted. Duplicate URL → 409 |
| PATCH | `/api/jobs/:id` | `{ status?, notes? }` | Status: discovered, contacted, screening, rejected, offer |
| DELETE | `/api/jobs/:id` | | Cascades to the outreach log |
| GET | `/api/outreach` | `?job_id=uuid` (optional) | |
| POST | `/api/outreach` | `{ job_id?, recipient_role, channel, message_sent, mark_contacted? }` | Channel: linkedin_dm, email, referral |
| GET | `/api/health` | | Which env vars are set, DB reachable, schema present, allowed models |
| POST | `/api/ai` | `{ action: "audit_profile", bullets, years?, domain?, model? }` | |
| POST | `/api/ai` | `{ action: "generate_outreach", company, recipient_title, role_url?, req_details?, proof_points?, audiences?, model? }` | `audiences` ⊆ head_of_ta, peer_referral, practice_head |
| POST | `/api/ai` | `{ action: "test_connection", model? }` | One-word round trip, latency, and OpenCode's live model list |

All `/api/ai` calls accept an optional `X-OpenCode-Key` header (the key from Settings).

## OpenCode Go key and model (in the app)

Click the gear icon, paste your OpenCode Go API key, pick a model and press **Test connection**. Then **Save**.

- **Where the key lives:** in your browser only (localStorage, or this tab only if you untick "Remember on this device"). Each AI request sends it in an `X-OpenCode-Key` header to this site's own `ai-brain` function, which forwards it to OpenCode and never logs or stores it. Nothing goes in the database.
- **Why not save it on the server:** a single-user app gains nothing from server-side encryption except a second secret (the encryption key) to manage. Keeping it in the browser means no key ever sits at rest on Netlify or Neon. The page's Content-Security-Policy only allows its own scripts, which is the main protection for a key held in the browser.
- **Fallback:** if no key is entered, the function uses `OPENCODE_API_KEY` from Netlify, limited to `OPENCODE_ALLOWED_MODELS`.
- **Models:** DeepSeek V4.1 Flash (default) and V4 Pro, plus every other model OpenCode Go serves on its OpenAI-compatible chat endpoint (GLM, Kimi, MiMo, MiniMax, LongCat, Hunyuan, Step), and a custom id field. Test connection also loads OpenCode's live model list. Models on Go's Anthropic or Responses endpoints (Claude, Qwen, MiniMax M3, GPT, Grok, Gemini) don't work with this app's chat-completions call.

## Environment variables

| Name | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string (pooled or direct) |
| `OPENCODE_API_URL` | no | Defaults to `https://opencode.ai/inference/go/openai/v1` |
| `OPENCODE_API_KEY` | no | Fallback key. You can paste your key in the app's Settings instead |
| `OPENCODE_MODEL` | no | Default `deepseek-v4.1-flash` |
| `OPENCODE_ALLOWED_MODELS` | no | Models allowed with the server key. Default `<OPENCODE_MODEL>,deepseek-v4-pro` |
| `APP_ACCESS_TOKEN` | strongly recommended | Shared secret. When set, the app asks for it once and sends it on every call |

Set `APP_ACCESS_TOKEN` before you share the URL with anyone. Without it, anyone who finds the site can read your pipeline and spend your OpenCode quota.

---

## Deploy: step by step (free tiers)

You need Node 20+, Git, a GitHub account, a Netlify account, a Neon account and an OpenCode Go subscription.

### 1. Put the code in a Git repository

```bash
unzip hunterops.zip && cd hunterops
git init
git add .
git commit -m "HunterOps: initial commit"
```

Create an empty repository on GitHub (no README), then:

```bash
git remote add origin https://github.com/<you>/hunterops.git
git branch -M main
git push -u origin main
```

### 2. Create the Neon database and run the schema

1. Sign in at https://console.neon.tech and create a project. Pick the region closest to you (AWS Asia Pacific (Singapore) for Bengaluru).
2. On the project dashboard click **Connect**, keep the database `neondb`, and copy the connection string. It looks like `postgresql://neondb_owner:...@ep-...-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
3. Run the schema, either way works:
   - **Neon SQL Editor:** open **SQL Editor**, paste all of `db/schema.sql`, click **Run**.
   - **From your machine:**
     ```bash
     cp .env.example .env        # paste DATABASE_URL into .env
     npm install
     npm run db:migrate
     ```
     It prints `Done. Tables present: outreach_logs, saved_jobs, users`.

The schema is idempotent, so running it again is safe.

### 3. Get your OpenCode Go key

1. Subscribe to OpenCode Go at https://opencode.ai/go.
2. Copy your API key from the OpenCode console.
3. The base URL for DeepSeek (and the other OpenAI-compatible Go models) is `https://opencode.ai/inference/go/openai/v1`. The function calls `.../chat/completions` on it with `Authorization: Bearer <key>`.

### 4a. Deploy from Git (recommended)

1. In Netlify: **Add new project → Import an existing project → GitHub**, pick the repository.
2. Netlify reads `netlify.toml`, so leave the build settings as they are (publish directory `public`, functions `netlify/functions`).
3. Before the first deploy, open **Site configuration → Environment variables → Add a variable** and add `DATABASE_URL` and `APP_ACCESS_TOKEN`. Add `OPENCODE_API_KEY` too only if you'd rather keep the key on the server than paste it in the app. (`APP_ACCESS_TOKEN` can be generated with `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`.) Mark them as secret.
4. Click **Deploy**. Every `git push` to `main` redeploys.

### 4b. Or deploy with the Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init                 # create a new site, link it to this folder / repo

netlify env:set DATABASE_URL "postgresql://..."      --secret
netlify env:set APP_ACCESS_TOKEN "..."               --secret
# optional, only if you don't want to paste the key in the app:
netlify env:set OPENCODE_API_KEY "..."               --secret

netlify deploy               # draft URL to check
netlify deploy --prod        # go live
```

### 5. Check it's live

Open the site. If the app is locked, it asks for your access key once. Click the gear icon, paste your OpenCode Go key, choose a model, press **Test connection**, then **Save**. The **DB** and **AI** dots in the top right should both be green.

- DB amber: connected, but the schema hasn't been run. Go back to step 2.3.
- DB red: `DATABASE_URL` missing or wrong.
- AI red: no key yet. Add one in Settings (or set `OPENCODE_API_KEY`).

After changing environment variables, redeploy (**Deploys → Trigger deploy**) so functions pick them up.

## Run locally

```bash
cp .env.example .env     # fill in the values
npm install
npm run dev              # netlify dev on http://localhost:8888, functions + redirects included
```

## Tests

The suites run the real function handlers against a local Postgres (through a stand-in for the Neon driver) and a fake OpenCode server. Node 22.3+ is needed for module mocking.

```bash
createdb hunterops_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/hunterops_test npm test
```

Without `TEST_DATABASE_URL` the database tests are skipped and the AI tests still run.

## Limits worth knowing

- Netlify synchronous functions stop at 60 seconds. The AI call gives up at 50 seconds with a clear error. `deepseek-v4.1-flash` normally answers well inside that.
- OpenCode Go has usage limits per 5 hours, week and month. A 429 from it shows as "usage limit reached".
- Google sometimes shows a CAPTCHA for repeated `site:` searches. Slow down, or sign in to Google.
- Data is single-user: there is no per-user separation. The `users` table exists for later multi-user work.
