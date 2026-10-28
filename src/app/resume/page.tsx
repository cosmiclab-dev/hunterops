import Link from 'next/link';
import { FileText } from 'lucide-react';
import { prisma } from '@/lib/db';
import { loadProfile } from '@/lib/profile';
import { EmptyState, PageHeader, Section } from '@/components/kit';
import { ResumeStudio } from '@/components/resume-studio';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

// Resumes in one place: the master resume from the profile, one tailored to
// any job on the board, and every tailored resume saved so far.
export default async function ResumePage({ searchParams }: { searchParams: { job?: string } }) {
  const profile = await loadProfile();
  if (!profile) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Resume" sub="Built from your profile, then tailored to each job." />
        <EmptyState icon={FileText} title="Add your CV first" action={<Button asChild><Link href="/profile">Upload your CV</Link></Button>}>
          Upload your CV on the Profile page. HunterOps builds the master resume from it.
        </EmptyState>
      </div>
    );
  }
  const [jobs, saved] = await Promise.all([
    prisma.job.findMany({ where: { status: { not: 'DISMISSED' } }, orderBy: [{ grillScore: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }], take: 60, select: { id: true, title: true, company: true, grillScore: true } }),
    prisma.resume.findMany({ orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, name: true, createdAt: true, slopScore: true, jobId: true, job: { select: { title: true, company: true } } } }),
  ]);
  const chosen = jobs.some((j) => j.id === searchParams.job) ? searchParams.job! : '';
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Resume" sub="Your master resume comes from your profile. Tailor it to a job and download it as PDF or Word." />
      <Section title="Master resume" action={<Link href="/profile" className="text-sm font-medium text-primary">Edit on Profile</Link>}>
        <ResumeStudio
          part="master"
          name={profile.name || 'Your resume'}
          headline={profile.headline || ''}
          jobs={[]}
          saved={[]}
        />
      </Section>
      <Section title="Tailor to a job">
        <ResumeStudio
          part="tailor"
          initialJob={chosen}
          jobs={jobs.map((j) => ({ id: j.id, label: `${j.company}: ${j.title}${j.grillScore != null ? ` (${j.grillScore})` : ''}` }))}
          saved={saved.map((r) => ({ id: r.id, name: r.name, jobId: r.jobId, createdAt: r.createdAt.toISOString(), slopScore: r.slopScore }))}
        />
      </Section>
      <Section title={`Saved resumes (${saved.length})`}>
        <ResumeStudio
          part="saved"
          jobs={[]}
          saved={saved.map((r) => ({ id: r.id, name: r.job ? `${r.job.company}: ${r.job.title}` : r.name, jobId: r.jobId, createdAt: r.createdAt.toISOString(), slopScore: r.slopScore }))}
        />
      </Section>
    </div>
  );
}
