import { z } from 'zod';
import { ok, readJson, route } from '@/lib/http';
import { loadJobPage } from '@/lib/job-page';
import { saveJobPage } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ url: z.string().min(8).max(2000), status: z.enum(['NEW', 'SAVED']).default('SAVED') });

// Add a job from its link: the posting is read through the ATS API or the page,
// grilled, and its company board is tracked by future scans.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  const page = await loadJobPage(body.url);
  const { job, grill, created } = await saveJobPage(page, body.status);
  return ok({ job, grill, created }, created ? 201 : 200);
});
