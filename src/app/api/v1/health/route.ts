import { NextRequest } from 'next/server';
import { resolveAiServiceConfig } from '@/server/contracts/ai-service.contract';
import { jsonSuccess, resolveRequestId } from '@/server/errors/api-error';

// GET /api/v1/health
export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const aiConfig = resolveAiServiceConfig();

  return jsonSuccess(
    {
      status: 'ok',
      service: 'siska-backend',
      apiVersion: 'v1',
      aiEngineMode: aiConfig.enabled
        ? 'remote_ai_service_rag'
        : 'local_firestore_rag',
      timestamp: new Date().toISOString(),
    },
    requestId,
    200,
  );
}
