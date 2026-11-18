"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, RefreshCw, Send } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { SiskaApiClientError, askSiskaAiQuestion } from "@/lib/api-client";
import { AI_UNAVAILABLE_MESSAGE, formatAiReply } from "@/lib/ai-reply";
import { auth } from "@/lib/firebase/client";

type Message = {
  id: string;
  from: "me" | "them";
  author: string;
  time: string;
  text: string;
  responseTimeMs?: number;
};

const nowTime = () =>
  new Date()
    .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    .replace(":", ".");

const formatResponseTime = (milliseconds: number) => {
  const seconds = milliseconds / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} dtk`;
};

const SUGGESTED_QUESTIONS = [
  "Apa itu SISKA?",
  "Bagaimana cara membuat pengaduan?",
  "Aku butuh nomor darurat yang bisa dihubungi secepatnya.",
];
const SESSION_STORAGE_PREFIX = "siska-ai-chat:";

function isStoredMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    (message.from === "me" || message.from === "them") &&
    typeof message.author === "string" &&
    typeof message.time === "string" &&
    typeof message.text === "string" &&
    (message.responseTimeMs === undefined ||
      (typeof message.responseTimeMs === "number" &&
        Number.isFinite(message.responseTimeMs) &&
        message.responseTimeMs >= 0))
  );
}

function saveSession(
  uid: string,
  session: {
    conversationId: string | null;
    messages: Message[];
    suggestionsUsed: boolean;
  },
): boolean {
  try {
    sessionStorage.setItem(
      `${SESSION_STORAGE_PREFIX}${uid}`,
      JSON.stringify(session),
    );
    return true;
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof SiskaApiClientError) {
    if (error.status === 429) {
      return "Kamu mengirim pertanyaan terlalu cepat. Silakan tunggu sebentar lalu coba lagi.";
    }
    return error.message;
  }

  return AI_UNAVAILABLE_MESSAGE;
}

export function AiChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestionsUsed, setSuggestionsUsed] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth) {
      setSessionReady(true);
      return;
    }

    return onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      setSessionUserId(uid);
      setSessionReady(false);
      setError("");

      if (!uid) {
        setConversationId(null);
        setMessages([]);
        setSuggestionsUsed(false);
        setSessionReady(true);
        return;
      }

      try {
        const stored = sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${uid}`);
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (
            !parsed ||
            typeof parsed !== "object" ||
            !("messages" in parsed) ||
            !Array.isArray(parsed.messages) ||
            !parsed.messages.every(isStoredMessage) ||
            !("conversationId" in parsed) ||
            (parsed.conversationId !== null &&
              (typeof parsed.conversationId !== "string" ||
                !/^[\w-]{1,128}$/.test(parsed.conversationId))) ||
            !("suggestionsUsed" in parsed) ||
            typeof parsed.suggestionsUsed !== "boolean"
          ) {
            throw new Error("Format riwayat percakapan tidak valid.");
          }

          setMessages(parsed.messages);
          setConversationId(parsed.conversationId);
          setSuggestionsUsed(parsed.suggestionsUsed);
        } else {
          setMessages([]);
          setConversationId(null);
          setSuggestionsUsed(false);
        }
      } catch {
        setMessages([]);
        setConversationId(null);
        setSuggestionsUsed(false);
        setError("Riwayat percakapan tidak dapat dibaca. Mulai percakapan baru untuk melanjutkan.");
      } finally {
        setSessionReady(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!sessionReady || !sessionUserId) return;
    if (
      !saveSession(sessionUserId, {
        conversationId,
        messages,
        suggestionsUsed,
      })
    ) {
      setError("Riwayat percakapan tidak dapat disimpan di browser ini.");
    }
  }, [conversationId, messages, sessionReady, sessionUserId, suggestionsUsed]);

  useEffect(() => {
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setError("");
    setSuggestionsUsed(false);
  }

  async function sendQuestion(text: string, suggested = false) {
    const message = text.trim();
    if (!message || loading || !sessionReady) return;
    const activeConversationId = conversationId ?? crypto.randomUUID();
    const nextSuggestionsUsed = suggestionsUsed || suggested;
    const nextMessages: Message[] = [
      ...messages,
      {
        id: crypto.randomUUID(),
        from: "me",
        author: "Kamu",
        time: nowTime(),
        text: message,
      },
    ];

    setConversationId(activeConversationId);
    setSuggestionsUsed(nextSuggestionsUsed);
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);
    setElapsedMs(0);
    const startedAt = performance.now();
    const elapsedTimer = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt);
    }, 250);
    if (
      sessionUserId &&
      !saveSession(sessionUserId, {
        conversationId: activeConversationId,
        messages: nextMessages,
        suggestionsUsed: nextSuggestionsUsed,
      })
    ) {
      setError("Riwayat percakapan tidak dapat disimpan di browser ini.");
    }

    try {
      const response = await askSiskaAiQuestion(
        message,
        activeConversationId,
      );
      const reply = formatAiReply(response) || AI_UNAVAILABLE_MESSAGE;
      const completedMessages: Message[] = [
        ...nextMessages,
        {
          id: crypto.randomUUID(),
          from: "them",
          author: "SISKA AI",
          time: nowTime(),
          text: reply,
          responseTimeMs: performance.now() - startedAt,
        },
      ];
      setMessages(completedMessages);
      if (
        sessionUserId &&
        !saveSession(sessionUserId, {
          conversationId: activeConversationId,
          messages: completedMessages,
          suggestionsUsed: nextSuggestionsUsed,
        })
      ) {
        setError("Riwayat percakapan tidak dapat disimpan di browser ini.");
      }
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      window.clearInterval(elapsedTimer);
      setLoading(false);
    }
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(input);
  }

  return (
    <div className="chat ai-chat">
      <section className="chat-pane" aria-label="Percakapan dengan SISKA AI">
        <div className="chat-head">
          <Bot aria-hidden />
          <div className="t">
            <b>SISKA AI</b>
            <small>Asisten informasi umum. Bukan pengganti pendamping profesional.</small>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={startNewConversation}
            disabled={loading || !sessionReady}
          >
            <RefreshCw aria-hidden />
            Percakapan baru
          </button>
        </div>

        <div className="chat-body" ref={bodyRef} aria-live="polite">
          {messages.length === 0 && sessionReady && (
            <div className="ai-chat-empty">
              <p>
                Halo, saya SISKA AI. Tanyakan informasi umum tentang alur
                pelaporan atau layanan yang tersedia.
              </p>
              {!suggestionsUsed && (
                <div className="ai-suggestions" aria-label="Pertanyaan rekomendasi">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={loading || !sessionReady}
                      onClick={() => void sendQuestion(question, true)}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`bubble ${message.from}`}>
              <div className="who">
                {message.author}
                <span className="bubble-meta">
                  {message.from === "them" && message.responseTimeMs !== undefined && (
                    <span className="response-time">{formatResponseTime(message.responseTimeMs)}</span>
                  )}
                  <span>{message.time}</span>
                </span>
              </div>
              {message.text}
            </div>
          ))}
          {loading && (
            <div className="bubble them" role="status">
              <div className="who">
                SISKA AI
                <span className="response-time">{formatResponseTime(elapsedMs)}</span>
              </div>
              Sedang menulis jawaban…
            </div>
          )}
        </div>

        <form className="compose" onSubmit={sendMessage}>
          <div className="compose-row">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Tanyakan informasi umum"
              aria-label="Tulis pertanyaan untuk SISKA AI"
              maxLength={4000}
              disabled={loading || !sessionReady}
            />
            <button
              className="btn btn-primary btn-sm"
              type="submit"
              disabled={loading || !sessionReady || !input.trim()}
            >
              <Send aria-hidden />
              Kirim
            </button>
          </div>
          {error && (
            <p className="error-text ai-chat-error" role="alert">
              {error}
            </p>
          )}
          <p className="help">
            Jangan masukkan nama, kronologi rinci, atau data pribadi. Untuk hal itu, gunakan laporan atau Chat dengan Admin.
          </p>
        </form>
      </section>
    </div>
  );
}
