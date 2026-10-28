import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Globe, Send } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GrillCard } from '@/components/grill-card';
import { JobStatus } from '@/components/job-actions';
import { ResumePanel } from '@/components/resume-panel';
import { EmailPanel } from '@/components/email-panel';
import { SlopChecker } from '@/components/slop-checker';
import { CoverLetterPanel } from '@/components/cover-letter-panel';
import { EvaluationPanel, type ReportRow } from '@/components/evaluation-panel';
import { ModesPanel, type ModeReport } from '@/components/modes-panel';
import type { GrillResult } from '@/lib/modules/grill';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function JobPage({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: {
      resumes: { orderBy: { createdAt: 'desc' }, select: { id: true, name: true, createdAt: true, slopScore: true } },
      emails: { orderBy: { createdAt: 'desc' } },
      artifact: { select: { coverLetterText: true } },
      reports: { orderBy: { createdAt: 'desc' }, take: 40 },
    },
  });
  if (!job) notFound();
  const g = job.grillBreakdown as unknown as GrillResult | null;
  const ev = job.reports.find((r) => r.mode === 'evaluation');
  const modeReports = job.reports.filter((r) => r.mode !== 'evaluation').map((r) => ({ id: r.id, mode: r.mode, model: r.model, createdAt: r.createdAt.toISOString(), data: r.data }) as unknown as ModeReport);
  const evaluation = ev ? ({ id: ev.id, score: ev.score, model: ev.model, createdAt: ev.createdAt.toISOString(), data: ev.data } as unknown as ReportRow) : null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/jobs" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All jobs</Link>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{job.company}</p>
          <h1 className="page-title mt-1">{job.title}</h1>
          <p className="meta mt-2">{[job.location, job.workMode !== 'UNKNOWN' ? job.workMode.toLowerCase() : null, job.salary, job.source, timeAgo(job.postedAt || job.firstSeenAt)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/browser/${job.id}`}><Globe /> Open in Browser</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/mailroom?tab=linkedin&jobId=${job.id}`}><Send /> Outreach</Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Original posting">
            <a href={job.url} target="_blank" rel="noopener noreferrer"><ExternalLink /></a>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1">
          <Tabs defaultValue={evaluation ? 'evaluate' : 'jd'}>
            <div className="scroll-x">
              <TabsList>
                <TabsTrigger value="evaluate">Evaluate</TabsTrigger>
                <TabsTrigger value="prep">Prep</TabsTrigger>
                <TabsTrigger value="jd">Description</TabsTrigger>
                <TabsTrigger value="resume">Resume</TabsTrigger>
                <TabsTrigger value="cover">Cover letter</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="check">Slop check</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="evaluate">
              <EvaluationPanel jobId={job.id} initial={evaluation} />
            </TabsContent>
            <TabsContent value="prep">
              <ModesPanel scope="job" jobId={job.id} initial={modeReports} />
            </TabsContent>
            <TabsContent value="jd">
              <div className="surface whitespace-pre-wrap p-5 text-sm leading-6">{job.description || 'No description yet. Open it in the Browser and HunterOps reads the full posting.'}</div>
            </TabsContent>
            <TabsContent value="resume">
              <ResumePanel jobId={job.id} saved={job.resumes.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
            </TabsContent>
            <TabsContent value="cover">
              <CoverLetterPanel jobId={job.id} initial={job.artifact?.coverLetterText ?? null} />
            </TabsContent>
            <TabsContent value="email">
              <EmailPanel
                jobId={job.id}
                initial={job.emails.map((e) => ({
                  id: e.id, toEmail: e.toEmail, subject: e.subject, body: e.body, status: e.status, kind: e.kind, framework: e.framework,
                  error: e.error, sentAt: e.sentAt?.toISOString() ?? null, createdAt: e.createdAt.toISOString(),
                }))}
              />
            </TabsContent>
            <TabsContent value="check">
              <SlopChecker />
            </TabsContent>
          </Tabs>
        </div>
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <GrillCard g={g} jobId={job.id} compact />
          <JobStatus id={job.id} status={job.status} notes={job.notes} />
        </div>
      </div>
    </div>
  );
}
