import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Send } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GrillBreakdown } from '@/components/grill-breakdown';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { JobStatus } from '@/components/job-actions';
import { ResumePanel } from '@/components/resume-panel';
import { EmailPanel } from '@/components/email-panel';
import { SlopChecker } from '@/components/slop-checker';
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
    },
  });
  if (!job) notFound();
  const g = job.grillBreakdown as unknown as GrillResult | null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/jobs" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Jobs</Link>
      <header className="surface hero-glow flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-start gap-4">
          <GrillScoreBadge score={job.grillScore} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-8 tracking-tight">{job.title}</h1>
            <p className="text-base font-medium leading-6">{job.company}</p>
            <p className="meta mt-1">{[job.location, job.workMode !== 'UNKNOWN' ? job.workMode.toLowerCase() : null, job.salary, job.source, timeAgo(job.postedAt || job.firstSeenAt)].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={job.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open the posting to apply</a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/outreach?jobId=${job.id}`}><Send /> Write outreach</Link>
          </Button>
        </div>
      </header>

      <JobStatus id={job.id} status={job.status} notes={job.notes} />

      <Tabs defaultValue="grill">
        <div className="scroll-x">
          <TabsList>
            <TabsTrigger value="grill">Grill</TabsTrigger>
            <TabsTrigger value="resume">Resume</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="jd">JD</TabsTrigger>
            <TabsTrigger value="check">Slop check</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="grill">
          {g ? <GrillBreakdown g={g} /> : (
            <p className="text-sm leading-5">Not grilled yet. <Link href="/profile" className="underline">Save your profile</Link>, then press Re-grill.</p>
          )}
        </TabsContent>
        <TabsContent value="resume">
          <ResumePanel jobId={job.id} saved={job.resumes.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
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
        <TabsContent value="jd">
          <div className="surface whitespace-pre-wrap p-4 text-sm leading-6">{job.description || 'No description was captured for this posting.'}</div>
        </TabsContent>
        <TabsContent value="check">
          <SlopChecker />
        </TabsContent>
      </Tabs>
    </div>
  );
}
