"use client";

import { useSyncExternalStore } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { fetchUnreadNotificationCount } from "@/lib/api-client";
import { auth } from "@/lib/firebase";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notification-events";

/**
 * Sumber tunggal badge belum dibaca untuk lonceng dan sidebar.
 * Satu poller + satu request bersama (bukan satu per komponen), dan langsung
 * menyegarkan diri saat ada aksi baca (event), tab kembali aktif, atau fokus.
 */
export type UnreadSummary = {
  /** Total badge lonceng: laporan unik + pengguna unik + notifikasi lain. */
  total: number;
  /** Jumlah laporan berbeda yang punya pembaruan belum dibaca. */
  reports: number;
  /** Jumlah PENGGUNA berbeda yang pesannya belum dibaca (bukan jumlah pesan). */
  chats: number;
};

const EMPTY: UnreadSummary = { total: 0, reports: 0, chats: 0 };
const POLL_MS = 20_000;

let state: UnreadSummary = EMPTY;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let stopAuth: (() => void) | undefined;
let inflight = false;
let queued = false;

function setState(next: UnreadSummary) {
  if (next.total === state.total && next.reports === state.reports && next.chats === state.chats) return;
  state = next;
  listeners.forEach((listener) => listener());
}

export async function refreshUnreadSummary(): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    setState(EMPTY);
    return;
  }
  // Gabungkan refresh yang datang beruntun menjadi satu request susulan.
  if (inflight) {
    queued = true;
    return;
  }
  inflight = true;
  try {
    const result = await fetchUnreadNotificationCount();
    if (auth?.currentUser?.uid !== uid) return; // sesi berganti saat request berjalan
    setState({
      total: result.unreadCount ?? 0,
      reports: result.unreadReportCount ?? 0,
      chats: result.unreadConversationCount ?? 0,
    });
  } catch {
    // Pertahankan nilai terakhir bila API sementara gagal.
  } finally {
    inflight = false;
    if (queued) {
      queued = false;
      void refreshUnreadSummary();
    }
  }
}

const onVisible = () => {
  if (document.visibilityState === "visible") void refreshUnreadSummary();
};
const onFocusOrEvent = () => void refreshUnreadSummary();

function start() {
  if (!auth) return;
  stopAuth = onAuthStateChanged(auth, (user) => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (!user) {
      setState(EMPTY);
      return;
    }
    void refreshUnreadSummary();
    timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshUnreadSummary();
    }, POLL_MS);
  });
  window.addEventListener("focus", onFocusOrEvent);
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onFocusOrEvent);
  document.addEventListener("visibilitychange", onVisible);
}

function stop() {
  stopAuth?.();
  stopAuth = undefined;
  if (timer) clearInterval(timer);
  timer = undefined;
  window.removeEventListener("focus", onFocusOrEvent);
  window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onFocusOrEvent);
  document.removeEventListener("visibilitychange", onVisible);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function useUnreadSummary(): UnreadSummary {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}
