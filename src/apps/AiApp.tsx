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
  Globe,
  KeyRound,
  Maximize2,
  Minimize2,
  SendHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useAiAssistant } from "../hooks/useAiAssistant";
import {
  AI_MODEL_OPTIONS,
  THINKING_LEVEL_OPTIONS,
  type AiModelId,
  type ThinkingLevel,
} from "../types/ai";
import type { MiniAppProps } from "../types/apps";

const QUICK_PROMPTS = [
  "Tin tức công nghệ nổi bật hôm nay",
  "Giải thích ngắn gọn Rust ownership",
  "Gợi ý kế hoạch tập trung 2 giờ tới",
];

export function AiApp({ onNotify, isMega, onSetMega }: MiniAppProps) {
  const {
    config,
    configLoaded,
    messages,
    sending,
    savingKey,
    setInputFocused,
    focusWindow,
    saveApiKey,
    clearApiKey,
    updateSettings,
    sendMessage,
    clearMessages,
    openSourceUrl,
  } = useAiAssistant();

  const [promptInput, setPromptInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const selectedModelMeta =
    AI_MODEL_OPTIONS.find((item) => item.id === config.model) ??
    AI_MODEL_OPTIONS[0];

  const availableThinkingLevels = THINKING_LEVEL_OPTIONS.filter(
    (level) => level.id !== "xhigh" || selectedModelMeta.supportsXHigh
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, isMega]);

  const handleModelChange = (nextModel: AiModelId) => {
    updateSettings(nextModel, config.thinkingLevel, config.webSearch).catch(
      () => {
        onNotify("Không lưu được cấu hình model");
      }
    );
  };

  const handleThinkingChange = (nextLevel: ThinkingLevel) => {
    updateSettings(config.model, nextLevel, config.webSearch).catch(() => {
      onNotify("Không lưu được mức suy luận");
    });
  };

  const handleToggleWebSearch = () => {
    const nextWeb = !config.webSearch;
    updateSettings(config.model, config.thinkingLevel, nextWeb)
      .then(() => {
        onNotify(
          nextWeb
            ? "Đã bật tìm kiếm web miễn phí (DuckDuckGo)"
            : "Đã tắt tìm kiếm web"
        );
      })
      .catch(() => {
        onNotify("Không cập nhật được tìm kiếm web");
      });
  };

  const handleSaveKey = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await saveApiKey(keyInput);
      setKeyInput("");
      setShowKeyPanel(false);
      onNotify("Đã lưu Gemini API key an toàn tại Rust");
    } catch (err) {
      onNotify(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Lưu API key thất bại"
      );
    }
  };

  const handleClearKey = async () => {
    try {
      await clearApiKey();
      onNotify("Đã xóa Gemini API key");
    } catch {
      onNotify("Không thể xóa API key");
    }
  };

  const submitPrompt = async (customText?: string) => {
    const content = (customText ?? promptInput).trim();
    if (!content || sending) return;
    if (!config.hasApiKey) {
      setShowKeyPanel(true);
      onNotify("Vui lòng nhập Gemini API key trước");
      return;
    }
    if (!customText) {
      setPromptInput("");
    }
    if (!isMega && messages.length === 0) {
      onSetMega(true);
    }
    await sendMessage(content);
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitPrompt();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setInputFocused(false);
      event.currentTarget.blur();
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

  const isKeyScreenVisible =
    configLoaded && (!config.hasApiKey || showKeyPanel);

  return (
    <div
      className={`ai-app ${isMega ? "is-mega" : ""}`}
      onMouseDown={() => focusWindow()}
    >
      <div className="ai-toolbar">
        <div className="ai-toolbar-left">
          <select
            className="ai-select"
            value={config.model}
            aria-label="Chọn model Gemini"
            title="Chọn model Gemini"
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onChange={(e) => handleModelChange(e.target.value as AiModelId)}
          >
            {AI_MODEL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.shortLabel} ({opt.tierNote})
              </option>
            ))}
          </select>

          <select
            className="ai-select ai-select-think"
            value={config.thinkingLevel}
            aria-label="Chọn mức suy luận"
            title="Mức suy luận (Thinking level)"
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onChange={(e) =>
              handleThinkingChange(e.target.value as ThinkingLevel)
            }
          >
            {availableThinkingLevels.map((lvl) => (
              <option key={lvl.id} value={lvl.id}>
                Think: {lvl.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`ai-pill-btn ${config.webSearch ? "is-active" : ""}`}
            title={
              config.webSearch
                ? "Đang bật tìm kiếm web miễn phí (DuckDuckGo qua Rust)"
                : "Đang tắt tìm kiếm web"
            }
            onClick={handleToggleWebSearch}
          >
            <Globe size={11} strokeWidth={2.2} />
            <span>Web</span>
          </button>
        </div>

        <div className="ai-toolbar-right">
          <button
            type="button"
            className={`ai-icon-btn ${showKeyPanel ? "is-active" : ""} ${
              !config.hasApiKey ? "is-warn" : ""
            }`}
            title={
              config.hasApiKey
                ? `Gemini API Key: ${config.maskedKey ?? "Đã lưu"}`
                : "Nhập Gemini API Key"
            }
            aria-label="Cấu hình Gemini API Key"
            onClick={() => setShowKeyPanel((prev) => !prev)}
          >
            <KeyRound size={12} strokeWidth={2.2} />
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              className="ai-icon-btn"
              title="Xóa đoạn hội thoại"
              aria-label="Xóa đoạn hội thoại"
              onClick={clearMessages}
            >
              <Trash2 size={12} strokeWidth={2.2} />
            </button>
          )}

          <button
            type="button"
            className="ai-icon-btn"
            title={isMega ? "Thu gọn cửa sổ AI" : "Mở rộng cửa sổ AI"}
            aria-label={isMega ? "Thu gọn cửa sổ AI" : "Mở rộng cửa sổ AI"}
            onClick={() => onSetMega(!isMega)}
          >
            {isMega ? (
              <Minimize2 size={12} strokeWidth={2.2} />
            ) : (
              <Maximize2 size={12} strokeWidth={2.2} />
            )}
          </button>
        </div>
      </div>

      {isKeyScreenVisible ? (
        <div className="ai-key-panel">
          <div className="ai-key-header">
            <div className="ai-key-title">
              <KeyRound size={13} strokeWidth={2.2} />
              <span>Gemini API Key (Lưu cục bộ tại Rust)</span>
            </div>
            {config.hasApiKey && (
              <button
                type="button"
                className="ai-icon-btn"
                aria-label="Đóng bảng API key"
                onClick={() => setShowKeyPanel(false)}
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </div>

          {config.hasApiKey && config.maskedKey && (
            <div className="ai-key-status">
              <span>Key hiện tại: </span>
              <code>{config.maskedKey}</code>
              <button
                type="button"
                className="ai-key-clear"
                disabled={savingKey}
                onClick={() => {
                  void handleClearKey();
                }}
              >
                Xóa key
              </button>
            </div>
          )}

          <form className="ai-key-form" onSubmit={handleSaveKey}>
            <input
              type="password"
              className="ai-input"
              placeholder="Dán Gemini API key (AIza...) từ Google AI Studio"
              value={keyInput}
              autoFocus
              onFocus={() => {
                focusWindow();
                setInputFocused(true);
              }}
              onBlur={() => setInputFocused(false)}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button
              type="submit"
              className="ai-save-btn"
              disabled={savingKey || keyInput.trim().length === 0}
            >
              {savingKey ? "Đang lưu..." : "Lưu key"}
            </button>
          </form>

          <div className="ai-key-note">
            Mặc định chạy <strong>gemini-4-hydrogen</strong> (có thêm{" "}
            <strong>gemini-2.5-flash</strong> dự phòng Free) và tìm kiếm web
            miễn phí qua Rust mà không tốn hạn mức Google Search Grounding.
          </div>
        </div>
      ) : (
        <>
          <div
            className="ai-chat-scroll"
            onWheel={(e) => e.stopPropagation()}
          >
            {messages.length === 0 ? (
              <div className="ai-empty-state">
                <div className="ai-empty-hero">
                  <Sparkles color="#38BDF8" size={15} strokeWidth={2.1} />
                  <span>{selectedModelMeta.label} sẵn sàng</span>
                </div>
                <div className="ai-quick-prompts">
                  {QUICK_PROMPTS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="ai-quick-chip"
                      onClick={() => {
                        void submitPrompt(item);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
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
                    <div
                      className={`ai-bubble ${msg.error ? "is-error" : ""}`}
                    >
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
                            {msg.thinkingLevel
                              ? ` · ${msg.thinkingLevel}`
                              : ""}
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
                          ? "Đang tìm web miễn phí & suy luận..."
                          : "Đang suy luận..."}
                      </span>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          <form className="ai-composer" onSubmit={handleFormSubmit}>
            <input
              type="text"
              className="ai-input"
              placeholder={
                config.webSearch
                  ? `Hỏi ${selectedModelMeta.shortLabel} (Web miễn phí)...`
                  : `Hỏi ${selectedModelMeta.shortLabel}...`
              }
              value={promptInput}
              disabled={sending}
              onFocus={() => {
                focusWindow();
                setInputFocused(true);
              }}
              onBlur={() => setInputFocused(false)}
              onKeyDown={handleInputKeyDown}
              onChange={(e) => setPromptInput(e.target.value)}
            />
            <button
              type="submit"
              className="ai-send-btn"
              disabled={sending || promptInput.trim().length === 0}
              aria-label="Gửi câu hỏi"
              title="Gửi (Enter)"
            >
              <SendHorizontal size={13} strokeWidth={2.3} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
