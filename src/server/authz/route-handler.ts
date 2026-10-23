/**
 * SISKA — Next.js Route Handler Security & Error Boundary Wrapper
 * Sumber otoritas: docs/05-BACKEND-ARCHITECTURE.md §2.2, §4, §8
 */

import type { NextRequest, NextResponse } from 'next/server';
import {
  resolveRequestId,
  toErrorResponse,
  type ApiErrorBody,
} from '@/server/errors/api-error';
import {
  verifyBearerToken,
  type AuthenticatedCaller,
} from '@/server/authz/verify-token';
import {
  requireAdmin,
  requireAuthorizedUser,
  requireRole,
  type AuthorizedCaller,
} from '@/server/authz/permissions';
import type { UserRole } from '@/types/domain';

export interface RouteContext<TParams = Record<string, string>> {
  params: Promise<TParams>;
}

export interface AuthenticatedRouteContext<TParams = Record<string, string>> {
  request: NextRequest;
  requestId: string;
  caller: AuthorizedCaller;
  params: TParams;
}

export interface RawAuthRouteContext<TParams = Record<string, string>> {
  request: NextRequest;
  requestId: string;
  caller: AuthenticatedCaller;
  params: TParams;
}

export interface RouteAuthOptions {
  /** Daftar role yang diizinkan. Default: `['reporter', 'admin']` */
  roles?: readonly UserRole[];
  /** Jika true, wajib role `'admin'` dengan Custom Claim terverifikasi */
  adminOnly?: boolean;
}

/**
 * Membungkus Next.js App Router Handler dengan:
 * 1. Pembuatan `requestId` (`X-Request-Id`)
 * 2. Verifikasi Firebase ID Token (`Authorization: Bearer <token>`)
 * 3. Pemeriksaan Role (`AuthzService`)
 * 4. Penanganan Error terstandarisasi (`{ code, message, requestId }`)
 */
export function withAuthenticatedRoute<
  TParams = Record<string, string>,
  TResponse = unknown,
>(
  handler: (
    ctx: AuthenticatedRouteContext<TParams>,
  ) => Promise<NextResponse<TResponse>>,
  options: RouteAuthOptions = {},
) {
  return async (
    request: NextRequest,
    context: RouteContext<TParams>,
  ): Promise<NextResponse<TResponse | ApiErrorBody>> => {
    const requestId = resolveRequestId(request);
    try {
      const rawCaller = await verifyBearerToken(request);

      let caller: AuthorizedCaller;
      if (options.adminOnly) {
        caller = requireAdmin(rawCaller);
      } else if (options.roles && options.roles.length > 0) {
        caller = requireRole(rawCaller, options.roles);
      } else {
        caller = requireAuthorizedUser(rawCaller);
      }

      const resolvedParams = context?.params ? await context.params : ({} as TParams);

      return await handler({
        request,
        requestId,
        caller,
        params: resolvedParams,
      });
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}

/**
 * Varian pembungkus untuk rute yang hanya membutuhkan token Firebase Auth valid
 * meskipun dokumen profil/claim role baru sedang diprovisioning (mis. inisiasi profil `/api/v1/profile`).
 */
export function withVerifiedTokenRoute<
  TParams = Record<string, string>,
  TResponse = unknown,
>(
  handler: (
    ctx: RawAuthRouteContext<TParams>,
  ) => Promise<NextResponse<TResponse>>,
) {
  return async (
    request: NextRequest,
    context: RouteContext<TParams>,
  ): Promise<NextResponse<TResponse | ApiErrorBody>> => {
    const requestId = resolveRequestId(request);
    try {
      const caller = await verifyBearerToken(request);
      const resolvedParams = context?.params ? await context.params : ({} as TParams);

      return await handler({
        request,
        requestId,
        caller,
        params: resolvedParams,
      });
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}

