export type AiModelId =
  | "gemini-4-hydrogen"
  | "gemini-4-neon"
  | "gemini-4-carbon"
  | "gemini-4-argon";

export type ThinkingLevel = "low" | "medium" | "high" | "xhigh";

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
  thinkingLevel: ThinkingLevel;
  webSearch: boolean;
}

export interface AiSourceLink {
  title: string;
  uri: string;
}

export interface AiReplyPayload {
  text: string;
  sources: AiSourceLink[];
  searchQueries: string[];
  model: string;
  thinkingLevel: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "model";
  text: string;
  sources?: AiSourceLink[];
  searchQueries?: string[];
  model?: string;
  thinkingLevel?: string;
  error?: boolean;
  createdAtMs: number;
}

export const AI_MODEL_OPTIONS: AiModelOption[] = [
  {
    id: "gemini-4-hydrogen",
    shortLabel: "Hydrogen",
    label: "Gemini 4 Hydrogen",
    tierNote: "Free & Paid",
    supportsXHigh: true,
  },
  {
    id: "gemini-4-neon",
    shortLabel: "Neon",
    label: "Gemini 4 Neon",
    tierNote: "Paid",
    supportsXHigh: false,
  },
  {
    id: "gemini-4-carbon",
    shortLabel: "Carbon",
    label: "Gemini 4 Carbon",
    tierNote: "Paid",
    supportsXHigh: false,
  },
  {
    id: "gemini-4-argon",
    shortLabel: "Argon",
    label: "Gemini 4 Argon",
    tierNote: "Paid",
    supportsXHigh: false,
  },
];

export const THINKING_LEVEL_OPTIONS: { id: ThinkingLevel; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Med" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "XHigh" },
];
