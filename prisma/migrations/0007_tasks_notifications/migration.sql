CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "job_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "href" TEXT,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tasks_status_updated_at_idx" ON "tasks"("status", "updated_at");

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "task_id" UUID,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_read_at_created_at_idx" ON "notifications"("read_at", "created_at");

CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- A profile whose CV shows no current role can join at once: fill an empty
-- notice period with "Immediate (0 days)" so the setup step reflects it.
UPDATE "profile" SET "data" = jsonb_set("data", '{noticePeriod}', '"Immediate (0 days)"')
WHERE coalesce("data"->>'noticePeriod', '') = ''
  AND jsonb_typeof("data"->'experience') = 'array'
  AND jsonb_array_length("data"->'experience') > 0
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("data"->'experience') e
    WHERE (e->>'title' || ' ' || coalesce(e->>'company', '')) !~* 'career break|sabbatical'
      AND (coalesce(e->>'end', '') ~* '^\s*(present|current|now|ongoing|till date|to date|today)\s*$'
           OR (coalesce(e->>'end', '') = '' AND coalesce(e->>'start', '') <> ''))
  );
