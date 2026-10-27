import { ProfileEditor } from '@/components/profile-editor';
import { loadProfile } from '@/lib/profile';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const profile = await loadProfile();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="meta mt-1">The single source for resumes, the Grill and emails.</p>
      </div>
      <ProfileEditor initial={profile} />
    </div>
  );
}
