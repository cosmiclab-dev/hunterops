import { ProfileEditor } from '@/components/profile-editor';
import { ProfileRoaster } from '@/components/profile-roaster';
import { PageHeader } from '@/components/kit';
import { ProfileTabs } from '@/components/profile-tabs';
import { loadProfile } from '@/lib/profile';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await loadProfile();
  const seed = (profile?.experience?.[0]?.bullets ?? []).join('\n');
  const done = profile ? [profile.name, profile.headline, profile.summary, profile.skills.length > 4, profile.experience.length > 0, profile.yearsExperience != null].filter(Boolean).length : 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={profile ? `Profile ${Math.round((done / 6) * 100)}% complete` : 'Start here'}
        title={profile?.name || 'Your profile'}
        sub={profile?.headline || 'The single source for resumes, Grill Scores and every message.'}
      />
      <ProfileTabs
        initialTab={searchParams.tab === 'roast' ? 'roast' : 'profile'}
        profile={<ProfileEditor initial={profile} />}
        roast={<ProfileRoaster seed={seed} />}
      />
    </div>
  );
}
