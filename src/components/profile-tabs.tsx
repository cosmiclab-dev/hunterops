'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Flame, UserRound } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ProfileTabs({ initialTab, profile, roast }: { initialTab: string; profile: React.ReactNode; roast: React.ReactNode }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  return (
    <Tabs value={tab} onValueChange={(v) => { setTab(v); router.replace(v === 'roast' ? '/profile?tab=roast' : '/profile', { scroll: false }); }}>
      <TabsList>
        <TabsTrigger value="profile"><UserRound /> Profile</TabsTrigger>
        <TabsTrigger value="roast"><Flame /> CV roaster</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">{profile}</TabsContent>
      <TabsContent value="roast">{roast}</TabsContent>
    </Tabs>
  );
}
