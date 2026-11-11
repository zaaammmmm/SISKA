import test from 'node:test';
import assert from 'node:assert/strict';

import { buildApiUrl } from '@/lib/api-client';

test('buildApiUrl normalizes backend prefixes without duplicating /api/v1', () => {
  const origin = 'https://app.example';

  assert.equal(buildApiUrl('/notifications', origin).toString(), 'https://app.example/api/v1/notifications');
  assert.equal(buildApiUrl('notifications', origin).toString(), 'https://app.example/api/v1/notifications');
  assert.equal(buildApiUrl('/api/v1/notifications', origin).toString(), 'https://app.example/api/v1/notifications');
  assert.equal(buildApiUrl('/api/v1/notifications/unread-count', origin).toString(), 'https://app.example/api/v1/notifications/unread-count');
});
