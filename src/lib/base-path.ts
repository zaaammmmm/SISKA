export const DEFAULT_BASE_PATH = '/siska';

export function getBasePath(): string {
  const configured = (process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? DEFAULT_BASE_PATH).trim();
  if (!configured || configured === '/') {
    return '';
  }

  return configured.replace(/\/+$/, '');
}

export function withBasePath(path: string): string {
  const normalizedPath = (path ?? '').trim();
  if (!normalizedPath) {
    return getBasePath();
  }

  const basePath = getBasePath();
  const candidate = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

  if (!basePath) {
    return candidate;
  }

  if (candidate === basePath || candidate.startsWith(`${basePath}/`)) {
    return candidate;
  }

  return `${basePath}${candidate}`;
}
