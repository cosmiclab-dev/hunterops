import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/kit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModesPanel, type ModeReport } from '@/components/modes-panel';
import { StoryBank } from '@/components/story-bank';
import { MODE_META } from '@/lib/career-ops/shared';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const GLOBAL = Object.entries(MODE_META).filter(([, m]) => m.scope === 'global').map(([id]) => id);

export default async function InsightsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const [reports, stories, settings] = await Promise.all([
    prisma.report.findMany({ where: { jobId: null, mode: { in: GLOBAL } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.story.findMany({ orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }], take: 200 }),
    loadSettings(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Insights" sub="What is working, skill gaps, wider job titles, recruiter replies and your interview story bank." />
      <Tabs defaultValue={searchParams.tab === 'stories' ? 'stories' : 'tools'}>
        <TabsList>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="stories">Story bank ({stories.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="tools">
          <ModesPanel scope="global" feed={settings.get('feed_keywords') || ''}
            initial={reports.map((r) => ({ id: r.id, mode: r.mode, model: r.model, createdAt: r.createdAt.toISOString(), data: r.data }) as unknown as ModeReport)} />
        </TabsContent>
        <TabsContent value="stories">
          <StoryBank initial={stories.map(({ id, theme, title, situation, task, action, result, reflection, bestFor, source, verified }) => ({ id, theme, title, situation, task, action, result, reflection, bestFor, source, verified }))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
