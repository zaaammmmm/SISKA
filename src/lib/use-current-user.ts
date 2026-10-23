"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export type CurrentUser = { name: string; email: string; username: string; initial: string; live: boolean };

/** Pengguna aktif dari Firebase Auth; jatuh ke identitas demo bila Firebase belum dikonfigurasi / belum login. */
export function useCurrentUser(fallbackName = "Pengguna demo", fallbackEmail = "pengguna@contoh.test"): CurrentUser {
  const [u, setU] = useState<CurrentUser>({
    name: fallbackName, email: fallbackEmail, username: fallbackName.toLowerCase().replace(/\s+/g, "_"),
    initial: fallbackName.charAt(0).toUpperCase(), live: false,
  });
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => {
      if (!user) return;
      const name = user.displayName || user.email?.split("@")[0] || fallbackName;
      setU({ name, email: user.email || fallbackEmail, username: name, initial: name.charAt(0).toUpperCase(), live: true });
    });
  }, [fallbackName, fallbackEmail]);
  return u;
}
