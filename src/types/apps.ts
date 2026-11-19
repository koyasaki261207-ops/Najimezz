import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export type MiniAppId = "calendar";

export type MiniAppStatus = "ready" | "coming-soon";

export interface MiniAppProps {
  onClose: () => void;
  onNotify: (message: string) => void;
}

export interface MiniAppDefinition {
  id: MiniAppId;
  name: string;
  description: string;
  accentColor: string;
  icon: LucideIcon;
  status: MiniAppStatus;
  supportsTall?: boolean;
  component: ComponentType<MiniAppProps>;
}
