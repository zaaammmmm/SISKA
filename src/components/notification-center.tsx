"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/api-client";
import { useUnreadSummary } from "@/lib/use-unread-summary";
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
  // Badge berasal dari store bersama (dideduplikasi per laporan/pengguna), bukan dihitung ulang di sini.
  const summary = useUnreadSummary();
  const unreadCount = summary.total;
  const [isLoading, setIsLoading] = useState(true);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refreshNotifications = useCallback(async (showLoading = false) => {
    if (!auth?.currentUser) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);
    const requestedUid = auth.currentUser.uid;
    try {
      // Daftar dibatasi agar UI tidak mengunduh seluruh riwayat notifikasi.
      const page = await fetchNotifications({ limit: 20 });
      // Abaikan respons lama bila akun berubah selama request berlangsung.
      if (auth.currentUser?.uid !== requestedUid) return;
      setItems(page.items);
      setLoadError(false);
    } catch {
      if (auth.currentUser?.uid === requestedUid) setLoadError(true);
    } finally {
      if (auth.currentUser?.uid === requestedUid) setIsLoading(false);
    }
  }, []);

  // Muat daftar saat login/logout.
  useEffect(() => {
    if (!auth) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setItems([]);
        setIsLoading(false);
        setLoadError(false);
        return;
      }
      void refreshNotifications(true);
    });
  }, [refreshNotifications]);

  // Daftar ikut segar setiap kali badge berubah (pesan/laporan baru, atau sudah dibaca di halaman lain).
  const summaryKey = `${summary.total}:${summary.reports}:${summary.chats}`;
  useEffect(() => {
    if (auth?.currentUser) void refreshNotifications(false);
  }, [summaryKey, refreshNotifications]);

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
      // Badge disegarkan oleh event dari api-client; tidak ada "-1" lokal yang bisa meleset
      // karena badge dihitung per laporan/pengguna, bukan per notifikasi.
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
        <div className="notification-panel" role="region" aria-label="Notifikasi SISKA">
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
