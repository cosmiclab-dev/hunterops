import { prisma } from '@/lib/db';
import { hasAppSecret } from '@/lib/crypto';
import { PROVIDERS } from '@/lib/llm/providers';
import { loadSettings, publicSettings } from '@/lib/settings';
import { seedCompanies } from '@/lib/scan/scanner';
import { SettingsForm } from '@/components/settings-form';
import { LogoutButton } from '@/components/logout-button';
import { SelfTest } from '@/components/self-test';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if ((await prisma.company.count()) === 0) await seedCompanies();
  const [settings, companies] = await Promise.all([
    loadSettings(),
    prisma.company.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div><p className="label-caps text-primary">Control room</p><h1 className="page-title mt-1">Settings</h1></div>
        {process.env.APP_PASSWORD && <LogoutButton />}
      </div>
      <SelfTest />
      <SettingsForm
        initial={publicSettings(settings)}
        providers={PROVIDERS}
        appSecret={hasAppSecret()}
        companies={companies.map(({ id, name, atsType, atsSlug, active, lastStatus, lastError, lastFound }) => ({ id, name, atsType, atsSlug, active, lastStatus, lastError, lastFound }))}
      />
    </div>
  );
}
