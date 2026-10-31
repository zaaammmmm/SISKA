import Image from "next/image";
import Link from "next/link";

/** Emblem SISKA: perisai heksagon + figur orang + dua tangan yang menopang. */
export function Emblem({ size = 40, tone = "teal" }: { size?: number; tone?: "teal" | "white" }) {
  const main = tone === "white" ? "#ffffff" : "#0a7f82";
  const soft = tone === "white" ? "#cfe8e5" : "#5fb3ad";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M13 31V17.5L32 6l19 11.5V31" stroke={main} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="22" r="5.2" fill={main} />
      <path d="M21.5 39c2.5-7 18.5-7 21 0l-10.5 9z" fill={main} />
      <path d="M6 31c-1 14 9 24 25 27-.5-12-8-22-25-27z" fill={main} />
      <path d="M58 31c1 14-9 24-25 27 .5-12 8-22 25-27z" fill={soft} />
    </svg>
  );
}

export function Logo({
  size = 36,
  tone = "teal",
  href = "/",
}: {
  size?: number;
  tone?: "teal" | "white";
  href?: string | null;
}) {
  const safeSize = Math.max(size, 16);

  const inner = (
    <Image
      src="/siska.png"
      alt="SISKA"
      width={safeSize}
      height={safeSize}
      priority
      style={{
        display: "block",
        width: safeSize,
        height: safeSize,
        objectFit: "contain",
        filter: tone === "white" ? "brightness(0) invert(1)" : "none",
      }}
    />
  );

  return href ? (
    <Link href={href} aria-label="SISKA — Beranda" style={{ display: "inline-flex", alignItems: "center" }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
