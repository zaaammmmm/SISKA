/**
 * SISKA — Backend Readiness & Health Check Route Handler (`/api/v1/health`)
 * Sumber otoritas:
 * - docs/05-BACKEND-ARCHITECTURE.md §9 (Health check)
 * - docs/06-AI-ARCHITECTURE.md §3 (`GET /health`: readiness only; no secret/environment values in response)
 */

import { NextRequest } from 'next/server';
import { resolveAiServiceConfig } from '@/server/contracts/ai-service.contract';
import { jsonSuccess, resolveRequestId } from '@/server/errors/api-error';

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const aiConfig = resolveAiServiceConfig();

  return jsonSuccess(
    {
      status: 'ok',
      service: 'siska-backend',
      apiVersion: 'v1',
      aiEngineMode: aiConfig.enabled
        ? 'remote_fastapi_rag'
        : 'local_firestore_rag',
      timestamp: new Date().toISOString(),
    },
    requestId,
    200,
  );
}

