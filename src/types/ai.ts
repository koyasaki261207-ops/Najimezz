export type AiModelId =
  | "auto"
  | "gemini-flash-lite-latest"
  | "gemini-2.5-flash-lite"
  | "gemini-2.0-flash-lite"
  | "gemini-2.5-flash"
  | "gemini-2.0-flash"
  | "gemini-flash-latest"
  | "gemini-3.8-flash"
  | "gemini-1.5-flash-002"
  | "gemini-1.5-flash"
  | "gemini-2.5-pro"
  | "gemini-1.5-pro"
  | "gemini-4-hydrogen";

export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

export interface AiModelOption {
  id: AiModelId;
  shortLabel: string;
  label: string;
  tierNote: string;
  supportsXHigh: boolean;
}

export interface AiConfigView {
  hasApiKey: boolean;
  maskedKey: string | null;
  model: AiModelId;
  resolvedModel: string | null;
  availableModels: string[];
  thinkingLevel: ThinkingLevel;
  webSearch: boolean;
  allowScreenCapture: boolean;
  allowPcControl: boolean;
}

export interface AiSourceLink {
  title: string;
  uri: string;
}

export interface PendingCommandView {
  id: string;
  command: string;
  explanation: string;
}

export type PendingCommandResolution = "pending" | "approved" | "rejected";

export interface AiReplyPayload {
  text: string;
  sources: AiSourceLink[];
  searchQueries: string[];
  actionsTaken: string[];
  pendingCommand: PendingCommandView | null;
  model: string;
  thinkingLevel: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "model";
  text: string;
  sources?: AiSourceLink[];
  searchQueries?: string[];
  actionsTaken?: string[];
  pendingCommand?: PendingCommandView;
  commandStatus?: PendingCommandResolution;
  model?: string;
  thinkingLevel?: string;
  error?: boolean;
  createdAtMs: number;
}

export const AI_MODEL_OPTIONS: AiModelOption[] = [
  {
    id: "auto",
    shortLabel: "Auto Fast",
    label: "Auto (Ưu tiên Flash-Lite siêu tốc)",
    tierNote: "Khuyên dùng",
    supportsXHigh: false,
  },
  {
    id: "gemini-flash-lite-latest",
    shortLabel: "Flash-Lite Latest",
    label: "Gemini Flash-Lite Latest",
    tierNote: "Tức thì · #1",
    supportsXHigh: false,
  },
  {
    id: "gemini-2.5-flash-lite",
    shortLabel: "2.5 Flash-Lite",
    label: "Gemini 2.5 Flash-Lite",
    tierNote: "Siêu nhanh",
    supportsXHigh: false,
  },
  {
    id: "gemini-2.0-flash-lite",
    shortLabel: "2.0 Flash-Lite",
    label: "Gemini 2.0 Flash-Lite",
    tierNote: "Rất nhẹ",
    supportsXHigh: false,
  },
  {
    id: "gemini-2.5-flash",
    shortLabel: "2.5 Flash",
    label: "Gemini 2.5 Flash",
    tierNote: "Cân bằng",
    supportsXHigh: false,
  },
  {
    id: "gemini-2.0-flash",
    shortLabel: "2.0 Flash",
    label: "Gemini 2.0 Flash",
    tierNote: "Nhanh",
    supportsXHigh: false,
  },
  {
    id: "gemini-flash-latest",
    shortLabel: "Flash Latest",
    label: "Gemini Flash Latest",
    tierNote: "Tự cập nhật",
    supportsXHigh: false,
  },
  {
    id: "gemini-3.8-flash",
    shortLabel: "3.8 Flash",
    label: "Gemini 3.8 Flash",
    tierNote: "Tài khoản mới",
    supportsXHigh: false,
  },
  {
    id: "gemini-1.5-flash-002",
    shortLabel: "1.5 Flash-002",
    label: "Gemini 1.5 Flash-002",
    tierNote: "Ổn định",
    supportsXHigh: false,
  },
  {
    id: "gemini-1.5-flash",
    shortLabel: "1.5 Flash",
    label: "Gemini 1.5 Flash",
    tierNote: "Tiêu chuẩn",
    supportsXHigh: false,
  },
  {
    id: "gemini-2.5-pro",
    shortLabel: "2.5 Pro",
    label: "Gemini 2.5 Pro",
    tierNote: "Chuyên sâu",
    supportsXHigh: false,
  },
  {
    id: "gemini-1.5-pro",
    shortLabel: "1.5 Pro",
    label: "Gemini 1.5 Pro",
    tierNote: "Chuyên sâu",
    supportsXHigh: false,
  },
  {
    id: "gemini-4-hydrogen",
    shortLabel: "Hydrogen",
    label: "Gemini 4 Hydrogen",
    tierNote: "Thử nghiệm",
    supportsXHigh: true,
  },
];

export const THINKING_LEVEL_OPTIONS: { id: ThinkingLevel; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Med" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "XHigh" },
];
