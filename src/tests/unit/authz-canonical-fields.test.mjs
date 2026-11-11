/**
 * Regression tests for canonical conversation ownership/assignment fields.
 * Legacy aliases are accepted only when the canonical field is absent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveConversationAdminId,
  resolveConversationReporterId,
} from '@/server/authz/permissions';

test('reporterId canonical field wins over reporterUid alias', () => {
  assert.equal(resolveConversationReporterId({ reporterId: 'canonical', reporterUid: 'legacy' }), 'canonical');
});

test('reporterUid is used only when reporterId is absent', () => {
  assert.equal(resolveConversationReporterId({ reporterUid: 'legacy' }), 'legacy');
});

test('empty/null reporterId does not fall back to stale reporterUid', () => {
  assert.equal(resolveConversationReporterId({ reporterId: null, reporterUid: 'legacy' }), '');
  assert.equal(resolveConversationReporterId({ reporterId: '', reporterUid: 'legacy' }), '');
});

test('assignedAdminId canonical field wins over adminUid alias', () => {
  assert.equal(resolveConversationAdminId({ assignedAdminId: 'admin-1', adminUid: 'admin-2' }), 'admin-1');
});

test('explicit null assignedAdminId means unassigned; stale adminUid is ignored', () => {
  assert.equal(resolveConversationAdminId({ assignedAdminId: null, adminUid: 'admin-2' }), null);
});

test('adminUid is used only when assignedAdminId is absent', () => {
  assert.equal(resolveConversationAdminId({ adminUid: 'legacy-admin' }), 'legacy-admin');
});
