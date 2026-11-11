import type { NotificationTargetType } from '@/types/domain';

export type NotificationRole = 'reporter' | 'admin';

export interface ResolvedNotificationTarget {
  href: string;
  query: Record<string, string> | null;
  label: string;
}

export function resolveNotificationTarget(
  targetType: NotificationTargetType | 'none' | null | undefined,
  targetId: string | null,
  role: NotificationRole = 'reporter',
): ResolvedNotificationTarget {
  const isAdmin = role === 'admin';

  switch (targetType) {
    case 'report':
      return {
        href: isAdmin ? '/admin/reports' : '/user/reports',
        query: targetId ? { reportId: targetId } : null,
        label: 'Lihat laporan',
      };
    case 'conversation':
      return {
        href: isAdmin ? '/admin/chat' : '/user/chat',
        query: targetId ? { conversationId: targetId } : null,
        label: 'Buka percakapan',
      };
    case 'education':
      return {
        href: targetId ? `/education/detail/${encodeURIComponent(targetId)}` : '/education',
        query: null,
        label: 'Buka edukasi',
      };
    default:
      return {
        href: isAdmin ? '/admin' : '/user',
        query: null,
        label: 'Lihat detail',
      };
  }
}
