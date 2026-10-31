/**
 * Pembentuk teks balasan SISKA AI untuk ditampilkan di bubble chat.
 *
 * Hanya `answer` (dan `escalationMessage` bila ada) yang tampil. Penanda sumber seperti
 * "[1]", nama rute internal, nama backend model, dan latensi tidak pernah ditampilkan —
 * membingungkan bagi pengguna. Pembersihan penanda juga dilakukan di AI service; di sini
 * lapisan pengaman kedua, terutama untuk jalur fallback Firestore yang memakai teks chunk mentah.
 */
import type { AiChatResponse } from '@/types/api';

const CITATION_RX =
  /[ \t]*(?:\[\s*(?:\d+(?:\s*[,;–-]\s*\d+)*|n)\s*\])+/gi;

export function stripCitationMarkers(text: string): string {
  return text
    .replace(CITATION_RX, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatAiReply(
  res: Pick<AiChatResponse, 'answer' | 'escalationMessage'>,
): string {
  const parts = [stripCitationMarkers(res.answer ?? '')];
  if (res.escalationMessage) parts.push(stripCitationMarkers(res.escalationMessage));
  return parts.filter(Boolean).join('\n\n');
}

export const AI_UNAVAILABLE_MESSAGE =
  'SISKA AI sedang tidak dapat menjawab saat ini. Silakan coba lagi sebentar lagi, atau pilih Chat dengan Admin untuk bantuan langsung.';
