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

interface StreamDeltaPayload {
  delta: string;
}

interface StreamStatusPayload {
  label: string;
}

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
  model: "auto",
  resolvedModel: null,
  availableModels: [],
  thinkingLevel: "off",
  webSearch: true,
  allowScreenCapture: true,
  allowPcControl: true,
};

export interface UseAiAssistantResult {
  config: AiConfigView;
  configLoaded: boolean;
  messages: AiMessage[];
  sending: boolean;
  streamingText: string;
  streamStatus: string | null;
  savingKey: boolean;
  refreshingModels: boolean;
  setInputFocused: (focused: boolean) => void;
  focusWindow: () => void;
  openAiSettings: () => void;
  dismissAskNusa: () => void;
  saveApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  refreshModels: () => Promise<void>;
  updateSettings: (
    model: AiModelId,
    thinkingLevel: ThinkingLevel,
    webSearch: boolean,
    allowScreenCapture?: boolean,
    allowPcControl?: boolean
  ) => Promise<void>;
  sendMessage: (promptText: string) => Promise<void>;
  resolvePendingCommand: (
    messageId: string,
    commandId: string,
    approved: boolean
  ) => Promise<void>;
  clearMessages: () => void;
  openSourceUrl: (url: string) => Promise<void>;
}

export function useAiAssistant(): UseAiAssistantResult {
  const tauri = isTauriRuntime();
  const [config, setConfig] = useState<AiConfigView>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(!tauri);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const hasPendingCommand = messages.some(
    (m) => m.pendingCommand && m.commandStatus === "pending"
  );

  useEffect(() => {
    if (!tauri) return;

    let unlistenConfig: (() => void) | undefined;
    let unlistenDelta: (() => void) | undefined;
    let unlistenReset: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

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

    listen<StreamDeltaPayload>("ai:stream-delta", (event) => {
      if (!event.payload?.delta) return;
      setStreamStatus(null);
      setStreamingText((prev) => prev + event.payload.delta);
    })
      .then((fn) => {
        unlistenDelta = fn;
      })
      .catch(() => {});

    listen("ai:stream-reset", () => {
      setStreamingText("");
    })
      .then((fn) => {
        unlistenReset = fn;
      })
      .catch(() => {});

    listen<StreamStatusPayload>("ai:stream-status", (event) => {
      if (event.payload?.label) {
        setStreamStatus(event.payload.label);
      }
    })
      .then((fn) => {
        unlistenStatus = fn;
      })
      .catch(() => {});

    return () => {
      unlistenConfig?.();
      unlistenDelta?.();
      unlistenReset?.();
      unlistenStatus?.();
    };
  }, [tauri]);

  useEffect(() => {
    if (!tauri) return;
    const locked = inputFocused || sending || hasPendingCommand;
    invoke("set_notch_input_lock", { locked }).catch(() => {});
  }, [inputFocused, sending, hasPendingCommand, tauri]);

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

  const refreshModels = useCallback(async () => {
    if (!tauri) return;
    setRefreshingModels(true);
    try {
      const updated = await invoke<AiConfigView>("refresh_ai_models");
      setConfig(updated);
    } finally {
      setRefreshingModels(false);
    }
  }, [tauri]);

  const updateSettings = useCallback(
    async (
      model: AiModelId,
      thinkingLevel: ThinkingLevel,
      webSearch: boolean,
      allowScreenCapture?: boolean,
      allowPcControl?: boolean
    ) => {
      const normalizedLevel: ThinkingLevel =
        thinkingLevel === "xhigh" && model !== "gemini-4-hydrogen"
          ? "high"
          : thinkingLevel;

      const nextScreen = allowScreenCapture ?? config.allowScreenCapture;
      const nextPc = allowPcControl ?? config.allowPcControl;

      setConfig((prev) => ({
        ...prev,
        model,
        thinkingLevel: normalizedLevel,
        webSearch,
        allowScreenCapture: nextScreen,
        allowPcControl: nextPc,
      }));

      if (!tauri) return;

      const updated = await invoke<AiConfigView>("update_ai_settings", {
        model,
        thinkingLevel: normalizedLevel,
        webSearch,
        allowScreenCapture: nextScreen,
        allowPcControl: nextPc,
      });
      setConfig(updated);
    },
    [config.allowPcControl, config.allowScreenCapture, tauri]
  );

  const appendReplyMessage = useCallback((reply: AiReplyPayload) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createMessageId(),
        role: "model",
        text: reply.text,
        sources: reply.sources,
        searchQueries: reply.searchQueries,
        actionsTaken: reply.actionsTaken,
        pendingCommand: reply.pendingCommand ?? undefined,
        commandStatus: reply.pendingCommand ? "pending" : undefined,
        model: reply.model,
        thinkingLevel: reply.thinkingLevel,
        createdAtMs: Date.now(),
      },
    ]);
  }, []);

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

      setMessages((prev) => [
        ...prev.map((m) =>
          m.commandStatus === "pending"
            ? { ...m, commandStatus: "rejected" as const }
            : m
        ),
        userMsg,
      ]);
      setStreamingText("");
      setStreamStatus(null);
      setSending(true);

      try {
        if (!tauri) {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          setMessages((prev) => [
            ...prev,
            {
              id: createMessageId(),
              role: "model",
              text: "Chế độ xem trước trình duyệt: hãy chạy bản Tauri để dùng đầy đủ trợ lý AI & thao tác máy tính.",
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

        appendReplyMessage(reply);
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
        setStreamingText("");
        setStreamStatus(null);
        setSending(false);
      }
    },
    [
      appendReplyMessage,
      config.model,
      config.thinkingLevel,
      config.webSearch,
      messages,
      sending,
      tauri,
    ]
  );

  const resolvePendingCommand = useCallback(
    async (messageId: string, commandId: string, approved: boolean) => {
      if (sending) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, commandStatus: approved ? "approved" : "rejected" }
            : m
        )
      );
      setStreamingText("");
      setStreamStatus(null);
      setSending(true);

      try {
        if (!tauri) return;
        const reply = await invoke<AiReplyPayload>("ai_resolve_pending_command", {
          commandId,
          approved,
        });
        appendReplyMessage(reply);
      } catch (err) {
        const errorText =
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : "Không thể hoàn tất thực thi lệnh";
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
        setStreamingText("");
        setStreamStatus(null);
        setSending(false);
      }
    },
    [appendReplyMessage, sending, tauri]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingText("");
    setStreamStatus(null);
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
    streamingText,
    streamStatus,
    savingKey,
    refreshingModels,
    setInputFocused,
    focusWindow,
    openAiSettings,
    dismissAskNusa,
    saveApiKey,
    clearApiKey,
    refreshModels,
    updateSettings,
    sendMessage,
    resolvePendingCommand,
    clearMessages,
    openSourceUrl,
  };
}
