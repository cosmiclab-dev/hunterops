import { PageHeader } from '@/components/kit';
import { NotificationsView } from '@/components/notifications-view';

export const dynamic = 'force-dynamic';

export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Notifications" sub="What the AI is working on now, what is ready for you and what failed. Turn on notifications to get them on your iPhone too." />
      <NotificationsView />
    </div>
  );
}
