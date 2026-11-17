import test from 'node:test';
import assert from 'node:assert/strict';

const loadConfig = async () => {
  const cacheBuster = Date.now() + Math.random();
  return import(`../../../next.config.ts?cb=${cacheBuster}`);
};

test('basePath and assetPrefix can be overridden by env for deployment root or subpath', async () => {
  process.env.NEXT_PUBLIC_BASE_PATH = '';
  const { default: config } = await loadConfig();

  assert.strictEqual(config.basePath, '');
  assert.strictEqual(config.assetPrefix, '');

  delete process.env.NEXT_PUBLIC_BASE_PATH;
});
