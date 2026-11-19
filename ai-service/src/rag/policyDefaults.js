// Kebijakan bawaan (v4) yang dibundel bersama kode
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS = JSON.parse(fs.readFileSync(path.join(here, 'policy-defaults.json'), 'utf-8'));
const cache = new WeakMap();

export function resolvePolicy(policyFile) {
  const key = policyFile && typeof policyFile === 'object' ? policyFile : DEFAULTS;
  if (cache.has(key)) return cache.get(key);
  const filePolicy = policyFile?.POLICY || {};
  const useFile = Number(filePolicy.version) >= Number(DEFAULTS.POLICY.version);
  const POLICY = useFile
    ? { ...DEFAULTS.POLICY, ...filePolicy, msg: { ...DEFAULTS.POLICY.msg, ...(filePolicy.msg || {}) } }
    : { ...DEFAULTS.POLICY };
  const limits = useFile ? { ...DEFAULTS.LIMITS, ...(policyFile?.limits || {}) } : { ...DEFAULTS.LIMITS };
  const out = { POLICY, limits, version: useFile ? filePolicy.version : 'bawaan' };
  cache.set(key, out);
  return out;
}
