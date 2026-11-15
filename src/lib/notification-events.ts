/**
 * Event ringan agar setiap aksi yang mengubah status baca (buka chat, buka laporan,
 * tandai semua dibaca) langsung menyegarkan badge lonceng + sidebar tanpa menunggu polling.
 * Berdiri sendiri (tanpa import api-client) supaya tidak menimbulkan circular import.
 */
export const NOTIFICATIONS_CHANGED_EVENT = 'siska:notifications-changed';

export function emitNotificationsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
