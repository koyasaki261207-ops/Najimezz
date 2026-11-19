import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AiConfigView,
  AiMessage,
  AiModelId,
  AiReplyPayload,
  ThinkingLevel,
} from "../types/ai";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function createMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_CONFIG: AiConfigView = {
  hasApiKey: false,
  maskedKey: null,
  model: "gemini-4-hydrogen",
  thinkingLevel: "low",
  webSearch: true,
};

export interface UseAiAssistantResult {
  config: AiConfigView;
  configLoaded: boolean;
  messages: AiMessage[];
  sending: boolean;
  savingKey: boolean;
  setInputFocused: (focused: boolean) => void;
  focusWindow: () => void;
  openAiSettings: () => void;
  dismissAskNusa: () => void;
  saveApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  updateSettings: (
    model: AiModelId,
    thinkingLevel: ThinkingLevel,
    webSearch: boolean
  ) => Promise<void>;
  sendMessage: (promptText: string) => Promise<void>;
  clearMessages: () => void;
  openSourceUrl: (url: string) => Promise<void>;
}

export function useAiAssistant(): UseAiAssistantResult {
  const tauri = isTauriRuntime();
  const [config, setConfig] = useState<AiConfigView>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(!tauri);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    if (!tauri) return;

    let unlistenConfig: (() => void) | undefined;

    invoke<AiConfigView>("get_ai_config")
      .then((loaded) => {
        setConfig(loaded);
        setConfigLoaded(true);
      })
      .catch(() => {
        setConfigLoaded(true);
      });

    listen<AiConfigView>("ai:config-updated", (event) => {
      setConfig(event.payload);
      setConfigLoaded(true);
    })
      .then((fn) => {
        unlistenConfig = fn;
      })
      .catch(() => {});

    return () => {
      if (unlistenConfig) {
        unlistenConfig();
      }
    };
  }, [tauri]);

  useEffect(() => {
    if (!tauri) return;
    const locked = inputFocused || sending;
    invoke("set_notch_input_lock", { locked }).catch(() => {});
  }, [inputFocused, sending, tauri]);

  useEffect(() => {
    if (!tauri) return;
    return () => {
      invoke("set_notch_input_lock", { locked: false }).catch(() => {});
    };
  }, [tauri]);

  const focusWindow = useCallback(() => {
    if (!tauri) return;
    invoke("focus_notch_window").catch(() => {});
  }, [tauri]);

  const openAiSettings = useCallback(() => {
    if (tauri) {
      invoke("open_settings_window", { tab: "ask-nusa" }).catch(() => {});
    } else {
      window.open("?window=settings&tab=ask-nusa", "_blank", "width=780,height=600");
    }
  }, [tauri]);

  const dismissAskNusa = useCallback(() => {
    setInputFocused(false);
    if (!tauri) return;
    invoke("dismiss_ask_nusa").catch(() => {});
  }, [tauri]);

  const saveApiKey = useCallback(
    async (apiKey: string) => {
      const cleaned = apiKey.trim();
      if (!cleaned) {
        throw new Error("API key không được để trống");
      }
      setSavingKey(true);
      try {
        if (!tauri) {
          setConfig((prev) => ({
            ...prev,
            hasApiKey: true,
            maskedKey: `${cleaned.slice(0, 4)}••••${cleaned.slice(-4)}`,
          }));
          return;
        }
        const updated = await invoke<AiConfigView>("save_ai_api_key", {
          apiKey: cleaned,
        });
        setConfig(updated);
      } finally {
        setSavingKey(false);
      }
    },
    [tauri]
  );

  const clearApiKey = useCallback(async () => {
    setSavingKey(true);
    try {
      if (!tauri) {
        setConfig((prev) => ({
          ...prev,
          hasApiKey: false,
          maskedKey: null,
        }));
        return;
      }
      const updated = await invoke<AiConfigView>("clear_ai_api_key");
      setConfig(updated);
    } finally {
      setSavingKey(false);
    }
  }, [tauri]);

  const updateSettings = useCallback(
    async (
      model: AiModelId,
      thinkingLevel: ThinkingLevel,
      webSearch: boolean
    ) => {
      const normalizedLevel: ThinkingLevel =
        thinkingLevel === "xhigh" && model !== "gemini-4-hydrogen"
          ? "high"
          : thinkingLevel;

      setConfig((prev) => ({
        ...prev,
        model,
        thinkingLevel: normalizedLevel,
        webSearch,
      }));

      if (!tauri) return;

      const updated = await invoke<AiConfigView>("update_ai_settings", {
        model,
        thinkingLevel: normalizedLevel,
        webSearch,
      });
      setConfig(updated);
    },
    [tauri]
  );

  const sendMessage = useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
      if (!trimmed || sending) return;

      const userMsg: AiMessage = {
        id: createMessageId(),
        role: "user",
        text: trimmed,
        createdAtMs: Date.now(),
      };

      const historyPayload = [
        ...messages.filter((m) => !m.error),
        userMsg,
      ].map((m) => ({
        role: m.role,
        text: m.text,
      }));

      setMessages((prev) => [...prev, userMsg]);
      setSending(true);

      try {
        if (!tauri) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "model",
              text: "Chế độ xem trước trình duyệt: hãy chạy bản Tauri để gọi trực tiếp Gemini API từ Rust.",
              model: config.model,
              thinkingLevel: config.thinkingLevel,
              createdAtMs: Date.now(),
            },
          ]);
          return;
        }

        const reply = await invoke<AiReplyPayload>("ai_send_message", {
          messages: historyPayload,
          model: config.model,
          thinkingLevel: config.thinkingLevel,
          webSearch: config.webSearch,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "model",
            text: reply.text,
            sources: reply.sources,
            searchQueries: reply.searchQueries,
            model: reply.model,
            thinkingLevel: reply.thinkingLevel,
            createdAtMs: Date.now(),
          },
        ]);
      } catch (err) {
        const errorText =
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : "Không thể nhận phản hồi từ Gemini";
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "model",
            text: errorText,
            error: true,
            createdAtMs: Date.now(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [config.model, config.thinkingLevel, config.webSearch, messages, sending, tauri]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const openSourceUrl = useCallback(
    async (url: string) => {
      if (!tauri) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      await invoke("open_external_url", { url });
    },
    [tauri]
  );

  return {
    config,
    configLoaded,
    messages,
    sending,
    savingKey,
    setInputFocused,
    focusWindow,
    openAiSettings,
    dismissAskNusa,
    saveApiKey,
    clearApiKey,
    updateSettings,
    sendMessage,
    clearMessages,
    openSourceUrl,
  };
}
