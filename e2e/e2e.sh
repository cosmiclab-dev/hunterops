#!/usr/bin/env bash
# Full end-to-end run on a local Postgres: fresh schema, production build,
# mock AI provider, local SMTP sink, API checks, then iPhone-viewport UI checks.
# Needs: DATABASE_URL in .env.e2e pointing at a throwaway database.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.e2e; set +a
export SMTP_OUT=${SMTP_OUT:-/tmp/hunterops-mail.jsonl}
npx prisma migrate reset --force --skip-generate --skip-seed >/dev/null
npx next build >/dev/null
node e2e/mock-llm.mjs & LLM=$!
node e2e/smtp-sink.mjs & SMTP=$!
npx next start -p 3100 >/tmp/hunterops-e2e-server.log 2>&1 & APP=$!
trap 'kill $LLM $SMTP $APP 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -sf http://localhost:3100/api/health >/dev/null && break; sleep 1; done
node e2e/run.mjs
node e2e/ui.mjs
