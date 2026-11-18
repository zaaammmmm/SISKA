import test from 'node:test';
import assert from 'node:assert/strict';

import { buildApiUrl } from '@/lib/api-client';

test('buildApiUrl preserves the /siska deployment prefix and avoids duplicate /api/v1', () => {
  const origin = 'https://app.example';

  assert.equal(buildApiUrl('/notifications', origin).toString(), 'https://app.example/siska/api/v1/notifications');
  assert.equal(buildApiUrl('notifications', origin).toString(), 'https://app.example/siska/api/v1/notifications');
  assert.equal(buildApiUrl('/api/v1/notifications', origin).toString(), 'https://app.example/siska/api/v1/notifications');
  assert.equal(buildApiUrl('/api/v1/notifications/unread-count', origin).toString(), 'https://app.example/siska/api/v1/notifications/unread-count');
});
