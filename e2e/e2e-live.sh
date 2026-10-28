#!/usr/bin/env bash
# The live user journey: the app on a local Postgres, the real internet for
# job boards, ATS pages and web search, and only the AI as a local stand-in.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.e2e; set +a
export ALLOW_PRIVATE_FETCH=1
npx prisma migrate reset --force --skip-generate --skip-seed >/dev/null
[ -n "${SKIP_BUILD:-}" ] || npx next build >/dev/null
node e2e/mock-llm.mjs & LLM=$!
./node_modules/.bin/next start -p 3100 >/tmp/hunterops-e2e-server.log 2>&1 & APP=$!
trap 'kill $LLM $APP 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -sf http://localhost:3100/api/health >/dev/null && break; sleep 1; done
node e2e/live-journey.mjs
