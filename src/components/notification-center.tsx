"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/api-client";
import { auth } from "@/lib/firebase";
import { resolveNotificationTarget, type NotificationRole } from "@/lib/notification-targets";
import type { SerializedNotificationItem } from "@/types/api";

function formatNotificationTime(value: string | null): string {
  if (!value) return "Baru";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Baru";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes}m lalu`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}j lalu`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}h lalu`;

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

export function NotificationCenter({ role }: { role: "user" | "admin" }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SerializedNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refreshNotifications = useCallback(async (showLoading = false) => {
    if (!auth?.currentUser) {
      setItems([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    const requestedUid = auth.currentUser.uid;
    try {
      // Seluruh data notifikasi diambil melalui API terautentikasi SISKA.
      // Daftar dibatasi agar UI tidak mengunduh seluruh riwayat notifikasi.
      const [page, count] = await Promise.all([
        fetchNotifications({ limit: 20 }),
        fetchUnreadNotificationCount(),
      ]);
      // Abaikan respons lama bila akun berubah selama request berlangsung.
      if (auth.currentUser?.uid !== requestedUid) return;
      setItems(page.items);
      setUnreadCount(count.unreadCount);
      setLoadError(false);
    } catch {
      if (auth.currentUser?.uid === requestedUid) setLoadError(true);
    } finally {
      if (auth.currentUser?.uid === requestedUid) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      setItems([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    let active = true;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;

    const refresh = async (showLoading = false) => {
      if (!active) return;
      await refreshNotifications(showLoading);
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (refreshTimer) clearInterval(refreshTimer);
      if (!user) {
        setItems([]);
        setUnreadCount(0);
        setIsLoading(false);
        setLoadError(false);
        return;
      }

      void refresh(true);
      // API tidak menyediakan stream; polling menjaga badge dan daftar tetap mutakhir.
      refreshTimer = setInterval(() => void refresh(false), 30_000);
    });

    const handleFocus = () => void refresh(false);
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      unsubscribeAuth();
      if (refreshTimer) clearInterval(refreshTimer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const normalizedRole: NotificationRole = role === "admin" ? "admin" : "reporter";

  const handleMarkSingleAsRead = async (notificationId: string) => {
    try {
      const updated = await markNotificationAsRead(notificationId);
      setItems((current) =>
        current.map((item) => item.id === notificationId ? updated : item),
      );
      setUnreadCount((current) => Math.max(current - 1, 0));
      return true;
    } catch {
      await refreshNotifications(false);
      return false;
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkAllBusy(true);
    try {
      await markAllNotificationsAsRead();
      setItems((current) =>
        current.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    } catch {
      await refreshNotifications(false);
    } finally {
      setMarkAllBusy(false);
    }
  };

  const handleSelectNotification = async (notification: SerializedNotificationItem) => {
    const resolved = resolveNotificationTarget(
      notification.targetType,
      notification.targetId,
      normalizedRole,
    );

    if (!notification.isRead) {
      await handleMarkSingleAsRead(notification.id);
    }

    const query = resolved.query
      ? new URLSearchParams(resolved.query).toString()
      : "";
    const url = query ? `${resolved.href}?${query}` : resolved.href;

    setOpen(false);
    router.push(url);
  };

  return (
    <div className="notification-shell" ref={panelRef}>
      <button
        type="button"
        className="bell"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void refreshNotifications(false);
        }}
        aria-label="Kelola notifikasi"
        aria-expanded={open}
      >
        <Bell aria-hidden />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-panel" role="menu" aria-label="Notifikasi SISKA">
          <div className="notification-header">
            <div>
              <strong>Notifikasi</strong>
              <small>{unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}</small>
            </div>
            {unreadCount > 0 && (
              <button type="button" className="text-link" onClick={() => void handleMarkAllAsRead()} disabled={markAllBusy}>
                {markAllBusy ? "Memproses…" : "Tandai semua dibaca"}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="notification-empty"><p>Memuat notifikasi…</p></div>
          ) : loadError && items.length === 0 ? (
            <div className="notification-empty"><p>Notifikasi belum dapat dimuat. Coba buka kembali beberapa saat lagi.</p></div>
          ) : items.length === 0 ? (
            <div className="notification-empty">
              <CheckCheck aria-hidden />
              <p>Belum ada notifikasi untuk akunmu.</p>
            </div>
          ) : (
            <div className="notification-list">
              {items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`notification-item ${notification.isRead ? "read" : "unread"}`}
                  onClick={() => void handleSelectNotification(notification)}
                >
                  <span className="notification-swatch" aria-hidden />
                  <span className="notification-copy">
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                    <small>{formatNotificationTime(notification.createdAt)}</small>
                  </span>
                  <ChevronRight aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
