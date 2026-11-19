import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Maximize2,
  Minimize2,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useAiAssistant } from "../hooks/useAiAssistant";
import { AI_MODEL_OPTIONS } from "../types/ai";

export interface AiPageProps {
  isMega: boolean;
  onSetMega: (mega: boolean) => void;
  onNotify: (message: string) => void;
  focusNonce?: number;
}

export function AiPage({
  onNotify,
  isMega,
  onSetMega,
  focusNonce = 0,
}: AiPageProps) {
  const {
    config,
    configLoaded,
    messages,
    sending,
    setInputFocused,
    focusWindow,
    openAiSettings,
    dismissAskNusa,
    sendMessage,
    clearMessages,
    openSourceUrl,
  } = useAiAssistant();

  const [promptInput, setPromptInput] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const selectedModelMeta =
    AI_MODEL_OPTIONS.find((item) => item.id === config.model) ??
    AI_MODEL_OPTIONS[0];

  const hasConversation = messages.length > 0 || sending;
  const needsApiKey = configLoaded && !config.hasApiKey;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, isMega]);

  useEffect(() => {
    if (focusNonce <= 0 || needsApiKey) return;
    focusWindow();
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [focusNonce, needsApiKey, focusWindow]);

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

    setPromptInput("");
    if (!isMega) {
      onSetMega(true);
    }
    await sendMessage(content);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      dismissAskNusa();
    }
  };

  const handleClearChat = () => {
    clearMessages();
    if (isMega) {
      onSetMega(false);
    }
  };

  const handleCopyReply = (id: string, text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopiedMsgId(id);
        onNotify("Đã sao chép câu trả lời");
        window.setTimeout(() => {
          setCopiedMsgId((curr) => (curr === id ? null : curr));
        }, 1400);
      })
      .catch(() => {
        onNotify("Không sao chép được nội dung");
      });
  };

  const renderPillBar = () => (
    <form
      className={`ai-pill-bar ${sending ? "is-sending" : ""} ${
        needsApiKey ? "is-needs-key" : ""
      }`}
      onSubmit={handleSubmit}
      onClick={() => {
        focusWindow();
        if (needsApiKey) {
          openAiSettings();
        } else {
          inputRef.current?.focus();
        }
      }}
    >
      <span
        className={`ai-nusa-eyes ${sending ? "is-thinking" : ""}`}
        aria-hidden="true"
      >
        <span />
        <span />
      </span>

      <input
        ref={inputRef}
        type="text"
        className="ai-pill-input"
        placeholder={
          needsApiKey ? "Nhập API key trong Cài đặt..." : "Ask Nusa..."
        }
        value={promptInput}
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
        onChange={(e) => setPromptInput(e.target.value)}
      />

      {needsApiKey ? (
        <button
          type="button"
          className="ai-pill-action-btn is-key-btn"
          title="Mở cài đặt Ask Nusa để nhập Gemini API key"
          aria-label="Mở cài đặt Ask Nusa"
          onClick={(e) => {
            e.stopPropagation();
            openAiSettings();
          }}
        >
          <KeyRound size={13} strokeWidth={2.2} />
        </button>
      ) : (
        <button
          type="submit"
          className="ai-pill-action-btn"
          disabled={sending || promptInput.trim().length === 0}
          title="Hỏi Ask Nusa (Enter)"
          aria-label="Gửi câu hỏi"
          onClick={(e) => e.stopPropagation()}
        >
          {sending ? (
            <Loader2 className="ai-spin" size={14} strokeWidth={2.2} />
          ) : (
            <Search size={14} strokeWidth={2.1} />
          )}
        </button>
      )}
    </form>
  );

  if (!hasConversation && !isMega) {
    return (
      <div
        className="ai-app ai-app-compact"
        onMouseDown={() => focusWindow()}
      >
        {renderPillBar()}
      </div>
    );
  }

  return (
    <div
      className={`ai-app ${isMega ? "is-mega" : "ai-app-compact"}`}
      onMouseDown={() => focusWindow()}
    >
      <div className="ai-mini-bar">
        <span className="ai-mini-status">
          {selectedModelMeta.shortLabel}
          {config.webSearch ? " · Web" : ""}
        </span>

        <div className="ai-mini-actions">
          <button
            type="button"
            className="ai-ghost-btn"
            title="Cài đặt Ask Nusa (Model, API Key, Web)"
            aria-label="Cài đặt Ask Nusa"
            onClick={openAiSettings}
          >
            <SlidersHorizontal size={11} strokeWidth={2.2} />
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              className="ai-ghost-btn"
              title="Xóa hội thoại và thu gọn"
              aria-label="Xóa hội thoại"
              onClick={handleClearChat}
            >
              <Trash2 size={11} strokeWidth={2.2} />
            </button>
          )}

          <button
            type="button"
            className="ai-ghost-btn"
            title={isMega ? "Thu gọn" : "Mở rộng"}
            aria-label={isMega ? "Thu gọn" : "Mở rộng"}
            onClick={() => onSetMega(!isMega)}
          >
            {isMega ? (
              <Minimize2 size={11} strokeWidth={2.2} />
            ) : (
              <Maximize2 size={11} strokeWidth={2.2} />
            )}
          </button>
        </div>
      </div>

      <div
        className="ai-chat-scroll"
        onWheel={(e) => e.stopPropagation()}
      >
        {messages.length === 0 ? (
          <div className="ai-blank-hint">
            Nhập câu hỏi bên dưới · Tùy chỉnh model &amp; key trong Cài đặt
          </div>
        ) : (
          <div className="ai-messages-list">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`ai-msg-row ${
                  msg.role === "user" ? "is-user" : "is-model"
                }`}
              >
                <div className={`ai-bubble ${msg.error ? "is-error" : ""}`}>
                  <div className="ai-bubble-text">{msg.text}</div>

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="ai-sources-list">
                      {msg.sources.slice(0, 5).map((src) => (
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

                  {msg.role === "model" && !msg.error && (
                    <div className="ai-bubble-footer">
                      <span className="ai-bubble-meta">
                        {msg.model ?? config.model}
                        {msg.thinkingLevel ? ` · ${msg.thinkingLevel}` : ""}
                      </span>
                      <button
                        type="button"
                        className="ai-copy-btn"
                        title="Sao chép"
                        aria-label="Sao chép câu trả lời"
                        onClick={() => handleCopyReply(msg.id, msg.text)}
                      >
                        {copiedMsgId === msg.id ? (
                          <Check size={10} strokeWidth={2.4} />
                        ) : (
                          <Copy size={10} strokeWidth={2.2} />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="ai-msg-row is-model">
                <div className="ai-bubble ai-bubble-loading">
                  <span className="ai-dot-pulse" />
                  <span>
                    {config.webSearch
                      ? "Đang tìm kiếm & suy luận..."
                      : "Đang suy luận..."}
                  </span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {renderPillBar()}
    </div>
  );
}
