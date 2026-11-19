export type MascotMood =
  | "hidden"
  | "awake"
  | "sleepy"
  | "sleeping"
  | "wave"
  | "happy";

export interface MascotStatePayload {
  mood: MascotMood;
  peeking: boolean;
}
