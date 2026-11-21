import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  ExternalLink,
  KeyRound,
  Play,
  Search,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useAiAssistant } from "../hooks/useAiAssistant";

export type AskStage = "pill" | "thinking" | "answered";

export interface AiPageProps {
  isMega: boolean;
  focusNonce: number;
  standalonePill?: boolean;
  onSetMega: (mega: boolean) => void;
  onStageChange?: (stage: AskStage) => void;
  onDismissPill?: () => void;
  onNotify: (message: string) => void;
}

function AskSpinnerIcon() {
  return (
    <svg
      className="ask-spinner-svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round">
        <line x1="8" y1="2.2" x2="8" y2="5.1" opacity="1" />
        <line x1="12.9" y1="5.1" x2="10.4" y2="6.6" opacity="0.82" />
        <line x1="12.9" y1="10.9" x2="10.4" y2="9.4" opacity="0.62" />
        <line x1="8" y1="13.8" x2="8" y2="10.9" opacity="0.44" />
        <line x1="3.1" y1="10.9" x2="5.6" y2="9.4" opacity="0.28" />
        <line x1="3.1" y1="5.1" x2="5.6" y2="6.6" opacity="0.18" />
      </g>
    </svg>
  );
}

function AskHappyEyes() {
  return (
    <svg
      className="ask-happy-eyes-svg"
      width="20"
      height="12"
      viewBox="0 0 20 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.2 8.8C3.3 5.2 6.7 5.2 7.8 8.8"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M12.2 8.8C13.3 5.2 16.7 5.2 17.8 8.8"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AiPage({
  isMega,
  focusNonce,
  standalonePill = false,
  onSetMega,
  onStageChange,
  onDismissPill,
  onNotify,
}: AiPageProps) {
  const {
    config,
    configLoaded,
    messages,
    sending,
    streamingText,
    streamStatus,
    setInputFocused,
    focusWindow,
    openAiSettings,
    dismissAskNusa,
    sendMessage,
    resolvePendingCommand,
    clearMessages,
    openSourceUrl,
  } = useAiAssistant();

  const [promptInput, setPromptInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [happyEyes, setHappyEyes] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastReplyIdRef = useRef<string | null>(null);
  const happyTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const needsApiKey = configLoaded && !config.hasApiKey;

  const latestUserMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i];
    }
    return null;
  }, [messages]);

  const latestModelMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "model") return messages[i];
    }
    return null;
  }, [messages]);

  const isStreamingReply = sending && streamingText.length > 0;

  const stage: AskStage = isStreamingReply
    ? "answered"
    : sending
      ? "thinking"
      : latestModelMsg
        ? "answered"
        : "pill";

  useEffect(() => {
    onStageChange?.(stage);
  }, [stage, onStageChange]);

  useEffect(() => {
    if (!standalonePill) return;
    const isTauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;

    const el = cardRef.current;
    if (!el || stage !== "answered") {
      invoke("set_ask_panel_height", { height: 0 }).catch(() => {});
      return;
    }

    const syncHeight = () => {
      const rectHeight = Math.ceil(el.getBoundingClientRect().height);
      if (rectHeight > 0) {
        invoke("set_ask_panel_height", { height: rectHeight + 24 }).catch(
          () => {}
        );
      }
    };

    syncHeight();
    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [standalonePill, stage]);

  useEffect(() => {
    if (!standalonePill) {
      if (stage === "answered" && !isMega) {
        onSetMega(true);
      } else if (stage === "pill" && isMega) {
        onSetMega(false);
      }
    }
  }, [stage, standalonePill, isMega, onSetMega]);

  useEffect(() => {
    if (!isStreamingReply || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [isStreamingReply, streamingText]);

  useEffect(() => {
    if (!latestModelMsg || latestModelMsg.error || sending) return;
    if (lastReplyIdRef.current === latestModelMsg.id) return;

    lastReplyIdRef.current = latestModelMsg.id;
    setHappyEyes(true);

    if (happyTimerRef.current !== null) {
      window.clearTimeout(happyTimerRef.current);
    }
    happyTimerRef.current = window.setTimeout(() => {
      setHappyEyes(false);
      happyTimerRef.current = null;
    }, 2800);

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);

    return () => window.clearTimeout(focusTimer);
  }, [latestModelMsg, sending]);

  useEffect(() => {
    return () => {
      if (happyTimerRef.current !== null) {
        window.clearTimeout(happyTimerRef.current);
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (focusNonce <= 0 || needsApiKey) return;
    focusWindow();
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [focusNonce, needsApiKey, focusWindow]);

  const handleDismiss = () => {
    onDismissPill?.();
    dismissAskNusa();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;

    if (needsApiKey) {
      openAiSettings();
      onNotify("Nhập Gemini API key trong Cài đặt → Ask Nusa");
      return;
    }

    const content = promptInput.trim();
    if (!content) return;

    setHappyEyes(false);
    setPromptInput("");
    await sendMessage(content);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      handleDismiss();
    }
  };

  const handleNewChat = () => {
    setHappyEyes(false);
    setPromptInput("");
    lastReplyIdRef.current = null;
    clearMessages();
    if (isMega) {
      onSetMega(false);
    }
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 40);
  };

  const handleCopyLatest = () => {
    if (!latestModelMsg?.text) return;
    navigator.clipboard
      ?.writeText(latestModelMsg.text)
      .then(() => {
        setCopied(true);
        if (copyTimerRef.current !== null) {
          window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copyTimerRef.current = null;
        }, 1600);
      })
      .catch(() => {
        onNotify("Không sao chép được nội dung");
      });
  };

  const showSmilingEyes =
    !sending && happyEyes && promptInput.trim().length === 0;

  const placeholderText = sending
    ? streamStatus ?? (isStreamingReply ? "Nusa is replying..." : "Nusa is thinking...")
    : needsApiKey
      ? "Nhập API key trong Cài đặt..."
      : "Ask Nusa anything";

  return (
    <div
      ref={cardRef}
      className={`ask-card is-stage-${stage} ${
        standalonePill ? "is-standalone" : "is-embedded"
      }`}
      onMouseDown={() => focusWindow()}
      onWheel={(e) => {
        if (stage !== "pill") {
          e.stopPropagation();
        }
      }}
    >
      <form
        className="ask-top-bar"
        onSubmit={handleSubmit}
        onClick={() => {
          focusWindow();
          if (needsApiKey) {
            openAiSettings();
          } else if (!sending) {
            inputRef.current?.focus();
          }
        }}
      >
        <span className="ask-left-indicator" aria-hidden="true">
          {sending ? (
            <AskSpinnerIcon />
          ) : showSmilingEyes ? (
            <AskHappyEyes />
          ) : (
            <span className="ask-nusa-eyes">
              <span />
              <span />
            </span>
          )}
        </span>

        <input
          ref={inputRef}
          type="text"
          className={`ask-top-input ${sending ? "is-thinking-text" : ""}`}
          placeholder={placeholderText}
          value={sending ? "" : promptInput}
          disabled={sending}
          readOnly={needsApiKey}
          onFocus={() => {
            focusWindow();
            if (!needsApiKey) {
              setInputFocused(true);
            }
          }}
          onBlur={() => setInputFocused(false)}
          onKeyDown={handleInputKeyDown}
          onChange={(e) => {
            if (happyEyes) {
              setHappyEyes(false);
            }
            setPromptInput(e.target.value);
          }}
        />

        {needsApiKey ? (
          <button
            type="button"
            className="ask-search-btn is-key-btn"
            title="Mở cài đặt Ask Nusa để nhập Gemini API key"
            aria-label="Mở cài đặt Ask Nusa"
            onClick={(e) => {
              e.stopPropagation();
              openAiSettings();
            }}
          >
            <KeyRound size={15} strokeWidth={2.2} />
          </button>
        ) : (
          <button
            type="submit"
            className="ask-search-btn"
            disabled={sending || promptInput.trim().length === 0}
            title="Hỏi Ask Nusa (Enter)"
            aria-label="Gửi câu hỏi"
            onClick={(e) => e.stopPropagation()}
          >
            <Search size={16} strokeWidth={2.1} />
          </button>
        )}
      </form>

      {stage === "thinking" && latestUserMsg && (
        <div className="ask-thinking-stage">
          <div className="ask-thinking-prompt-chip" title={latestUserMsg.text}>
            {latestUserMsg.text}
          </div>
        </div>
      )}

      {stage === "answered" && (isStreamingReply || latestModelMsg) && (
        <>
          <div
            ref={bodyRef}
            className="ask-answer-scroll"
            onWheel={(e) => e.stopPropagation()}
          >
            {isStreamingReply ? (
              <div className="ask-answer-text">
                {streamingText}
                <span className="ask-stream-cursor" aria-hidden="true" />
              </div>
            ) : (
              latestModelMsg && (
                <>
                  {latestModelMsg.actionsTaken &&
                    latestModelMsg.actionsTaken.length > 0 && (
                      <div className="ai-actions-list">
                        {latestModelMsg.actionsTaken.map((act, idx) => (
                          <span
                            key={`${latestModelMsg.id}-act-${idx}`}
                            className="ai-action-chip"
                          >
                            <Zap size={9} strokeWidth={2.3} />
                            <span>{act}</span>
                          </span>
                        ))}
                      </div>
                    )}

                  {latestModelMsg.text && (
                    <div
                      className={`ask-answer-text ${
                        latestModelMsg.error ? "is-error" : ""
                      }`}
                    >
                      {latestModelMsg.text}
                    </div>
                  )}

                  {latestModelMsg.pendingCommand && (
                    <div className="ai-cmd-card">
                      <div className="ai-cmd-head">
                        <Terminal size={11} strokeWidth={2.2} />
                        <span>{latestModelMsg.pendingCommand.explanation}</span>
                      </div>

                      <pre className="ai-cmd-code">
                        <code>{latestModelMsg.pendingCommand.command}</code>
                      </pre>

                      {latestModelMsg.commandStatus === "pending" ? (
                        <div className="ai-cmd-actions">
                          <button
                            type="button"
                            className="ai-cmd-btn is-reject"
                            disabled={sending}
                            onClick={() => {
                              void resolvePendingCommand(
                                latestModelMsg.id,
                                latestModelMsg.pendingCommand!.id,
                                false
                              );
                            }}
                          >
                            <X size={11} strokeWidth={2.4} />
                            <span>Từ chối</span>
                          </button>
                          <button
                            type="button"
                            className="ai-cmd-btn is-approve"
                            disabled={sending}
                            onClick={() => {
                              void resolvePendingCommand(
                                latestModelMsg.id,
                                latestModelMsg.pendingCommand!.id,
                                true
                              );
                            }}
                          >
                            <Play size={10} strokeWidth={2.4} />
                            <span>Cho phép chạy</span>
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`ai-cmd-status ${
                            latestModelMsg.commandStatus === "approved"
                              ? "is-approved"
                              : "is-rejected"
                          }`}
                        >
                          {latestModelMsg.commandStatus === "approved"
                            ? "✓ Đã cho phép thực thi"
                            : "✕ Đã từ chối thực thi"}
                        </div>
                      )}
                    </div>
                  )}

                  {latestModelMsg.sources && latestModelMsg.sources.length > 0 && (
                    <div className="ai-sources-list">
                      {latestModelMsg.sources.slice(0, 5).map((src) => (
                        <button
                          key={src.uri}
                          type="button"
                          className="ai-source-chip"
                          title={src.uri}
                          onClick={() => {
                            openSourceUrl(src.uri).catch(() => {
                              onNotify("Không mở được liên kết nguồn");
                            });
                          }}
                        >
                          <ExternalLink size={9} strokeWidth={2.2} />
                          <span>{src.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            )}
          </div>

          <div className="ask-answer-footer">
            <div className="ask-footer-hint">
              <button
                type="button"
                className="ask-footer-settings-link"
                title="Mở cài đặt Ask Nusa"
                onClick={openAiSettings}
              >
                {isStreamingReply
                  ? config.resolvedModel ?? "Gemini"
                  : latestModelMsg?.model ?? config.resolvedModel ?? "Gemini"}
              </button>
              <span>
                {isStreamingReply
                  ? " · Streaming..."
                  : " · Enter to ask a follow-up"}
              </span>
            </div>

            {!isStreamingReply && latestModelMsg && (
              <div className="ask-footer-actions">
                {!latestModelMsg.error && (
                  <button
                    type="button"
                    className="ask-footer-pill-btn"
                    onClick={handleCopyLatest}
                  >
                    {copied ? (
                      <>
                        <Check size={11} strokeWidth={2.5} />
                        <span>Copied</span>
                      </>
                    ) : (
                      <span>Copy</span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  className="ask-footer-pill-btn"
                  onClick={handleNewChat}
                >
                  New chat
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
