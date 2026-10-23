/**
 * Node.js ESM Loader Hook untuk meresolusi alias `@/*` ke `./src/*`
 * serta menghubungkan `firebase-admin/*` dan `next/server` ke harness pengujian
 * saat menjalankan pengujian unit/integrasi TypeScript secara langsung di Node 22+/24+.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolvePath(__dirname, '../..');
const firebaseMockUrl = pathToFileURL(
  resolvePath(__dirname, './firebase-admin-mock.mjs'),
).href;

function isFile(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveCandidateFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    resolvePath(basePath, 'index.ts'),
    resolvePath(basePath, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (isFile(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

const nextServerShimUrl =
  'data:text/javascript,' +
  encodeURIComponent(`
export class NextResponse extends Response {
  static json(body, init = {}) {
    const headers = new Headers(init.headers || {});
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers,
    });
  }
}
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const targetPath = resolvePath(projectRoot, 'src', specifier.slice(2));
      const resolvedUrl = resolveCandidateFile(targetPath);
      if (resolvedUrl) {
        return { url: resolvedUrl, shortCircuit: true };
      }
    }
    if (
      specifier === 'firebase-admin/app' ||
      specifier === 'firebase-admin/auth' ||
      specifier === 'firebase-admin/firestore' ||
      specifier === 'firebase-admin/storage'
    ) {
      return { url: firebaseMockUrl, shortCircuit: true };
    }
    if (
      specifier === 'next/server' &&
      !existsSync(resolvePath(projectRoot, 'node_modules/next'))
    ) {
      return { url: nextServerShimUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

