// Pembatas Laju Permintaan

import { ApiError } from '@/server/errors/api-error';

export interface RateLimitRule {
  action: string;
  maxRequests: number;
  windowMs: number;
}

// Kebijakan Rate Limit
export const RATE_LIMIT_POLICIES = {
  CREATE_REPORT: {
    action: 'report:create',
    maxRequests: 10,
    windowMs: 60_000,
  },
  UPLOAD_EVIDENCE: {
    action: 'evidence:upload',
    maxRequests: 15,
    windowMs: 60_000,
  },
  SEND_MESSAGE: {
    action: 'chat:send_message',
    maxRequests: 30,
    windowMs: 60_000,
  },
  AI_CHAT: {
    action: 'ai:chat',
    maxRequests: 20,
    windowMs: 60_000,
  },
  ADMIN_MUTATION: {
    action: 'admin:mutation',
    maxRequests: 30,
    windowMs: 60_000,
  },
} as const satisfies Record<string, RateLimitRule>;

interface WindowEntry {
  timestamps: number[];
}

const buckets = new Map<string, WindowEntry>();

// Pemeriksaan Kuota Permintaan
export function enforceRateLimit(subjectKey: string, rule: RateLimitRule): void {
  const now = Date.now();
  const windowStart = now - rule.windowMs;
  const mapKey = `${rule.action}:${subjectKey}`;

  const existing = buckets.get(mapKey);
  const validTimestamps = existing
    ? existing.timestamps.filter((ts) => ts > windowStart)
    : [];

  if (validTimestamps.length >= rule.maxRequests) {
    const oldestInWindow = validTimestamps[0] ?? now;
    const retryAfterMs = Math.max(1000, oldestInWindow + rule.windowMs - now);
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    throw ApiError.rateLimited(retryAfterSeconds);
  }

  validTimestamps.push(now);
  buckets.set(mapKey, { timestamps: validTimestamps });
}
