'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { History, Mail, MessageSquareText, ShieldQuestion, SpellCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmailPanel, type EmailRow } from '@/components/email-panel';
import { GapScripts, Log, Writer, type LogItem } from '@/components/outreach-workspace';
import { PlainEnglish } from '@/components/plain-english';


type Job = { id: string; title: string; company: string };

export function Mailroom({ initialTab, emails, jobs, log, job }: { initialTab: string; emails: EmailRow[]; jobs: Job[]; log: LogItem[]; job: Job | null }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const due = log.filter((l) => l.status === 'sent' && l.followUpAt && new Date(l.followUpAt).getTime() < Date.now() + 86_400_000).length;
  return (
    <Tabs value={tab} onValueChange={(v) => { setTab(v); router.replace(`/mailroom?tab=${v}${job ? `&jobId=${job.id}` : ''}`, { scroll: false }); }}>
      <div className="scroll-x">
        <TabsList>
          <TabsTrigger value="email"><Mail /> Emails</TabsTrigger>
          <TabsTrigger value="linkedin"><MessageSquareText /> LinkedIn & referrals</TabsTrigger>
          <TabsTrigger value="gap"><ShieldQuestion /> Gap scripts</TabsTrigger>
          <TabsTrigger value="log">
            <History /> Follow-ups
            {due > 0 && <span className="ml-1 rounded bg-warning px-1.5 text-[10px] font-bold text-background">{due}</span>}
          </TabsTrigger>
          <TabsTrigger value="plain"><SpellCheck /> Plain English</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="email"><EmailPanel initial={emails} jobs={jobs} /></TabsContent>
      <TabsContent value="linkedin"><Writer job={job} onLogged={() => router.refresh()} /></TabsContent>
      <TabsContent value="gap"><GapScripts /></TabsContent>
      <TabsContent value="log"><Log items={log} /></TabsContent>
      <TabsContent value="plain"><PlainEnglish /></TabsContent>
    </Tabs>
  );
}
