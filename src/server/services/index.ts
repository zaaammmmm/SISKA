/**
 * SISKA — Domain Services Barrel (`src/server/services`)
 * Sumber otoritas:
 * - docs/05-BACKEND-ARCHITECTURE.md §2 (`ReportService`, `EvidenceService`, `ConversationService`, `KnowledgeBaseService`, `AuditService`, `ProfileService`, `AiGatewayService`)
 */

export * as ReportService from '@/server/services/report.service';
export * as EvidenceService from '@/server/services/evidence.service';
export * as ConversationService from '@/server/services/conversation.service';
export * as KnowledgeBaseService from '@/server/services/knowledge.service';
export * as AiGatewayService from '@/server/services/ai.service';
export * as AuditService from '@/server/services/audit.service';
export * as ProfileService from '@/server/services/profile.service';

export {
  createReport,
  listReports,
  getReportDetail,
  updateReportStatus,
  getReportsSummary,
} from '@/server/services/report.service';

export {
  registerEvidenceUpload,
  uploadEvidenceBinary,
  authorizeEvidenceDownload,
} from '@/server/services/evidence.service';

export {
  listConversations,
  createOrOpenConversation,
  listMessages,
  sendMessage,
  getConversationById,
  updateConversationByAdmin,
} from '@/server/services/conversation.service';

export {
  extractAndChunkPdfBytes,
  ingestKnowledgeDocumentBytes,
  listKnowledgeDocuments,
  uploadKnowledgeDocument,
  deleteKnowledgeDocument,
  requestKnowledgeReindex,
} from '@/server/services/knowledge.service';

export {
  type AiCitationSource,
  type AiChatResponse,
  answerGeneralQuestion,
} from '@/server/services/ai.service';

export {
  getMyProfile,
  updateMyProfile,
  provisionReporterProfile,
} from '@/server/services/profile.service';

export {
  recordAuditEvent,
  recordAuditEventInTransaction,
  recordAuditEventInBatch,
  listAuditEvents,
} from '@/server/services/audit.service';

