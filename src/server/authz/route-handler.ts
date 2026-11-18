// Pembungkus Route Handler

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
  roles?: readonly UserRole[];
  adminOnly?: boolean;
}

// Rute Terautentikasi Penuh
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

// Rute Token Terverifikasi
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
