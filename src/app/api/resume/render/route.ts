import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, readJson, route } from '@/lib/http';
import { normalizeResume, requireProfile } from '@/lib/profile';
import { renderDocx, renderPdf } from '@/lib/resume-render';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Body = z.object({
  resumeId: z.string().uuid().optional(),
  format: z.enum(['pdf', 'docx']).default('pdf'),
  density: z.enum(['standard', 'compact']).default('standard'),
});

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'Resume';

// Renders a saved tailored resume, or the master profile when no resumeId is given.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  let data;
  let name: string;
  if (body.resumeId) {
    const r = await prisma.resume.findUnique({ where: { id: body.resumeId } });
    if (!r) throw new HttpError(404, 'Resume not found.');
    data = normalizeResume(r.data);
    name = r.name;
  } else {
    data = normalizeResume(await requireProfile());
    name = `${data.name || 'Resume'}`;
  }
  const filename = `${slug(name)}.${body.format}`;
  const buf = body.format === 'pdf' ? (await renderPdf(data, body.density)).pdf : await renderDocx(data, body.density);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': body.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
