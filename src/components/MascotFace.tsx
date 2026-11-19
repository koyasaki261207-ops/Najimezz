import type { MascotMood } from "../types/mascot";

interface MascotFaceProps {
  mood: Exclude<MascotMood, "hidden">;
}

export function MascotFace({ mood }: MascotFaceProps) {
  return (
    <div
      className={`mascot-face is-mood-${mood}`}
      aria-label={`Nusa mascot (${mood})`}
    >
      <div className="mascot-glow-layer" aria-hidden="true" />
      <div className="mascot-rim-bar" aria-hidden="true" />

      <div className="mascot-stage">
        {mood === "wave" && (
          <svg
            className="mascot-svg"
            width="106"
            height="32"
            viewBox="0 0 106 32"
            fill="none"
          >
            <defs>
              <radialGradient id="mascot-eye-halo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(165, 216, 255, 0.58)" />
                <stop offset="60%" stopColor="rgba(96, 165, 250, 0.16)" />
                <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
              </radialGradient>
            </defs>

            <ellipse cx="37" cy="17" rx="13" ry="11" fill="url(#mascot-eye-halo)" />
            <ellipse cx="63" cy="17" rx="13" ry="11" fill="url(#mascot-eye-halo)" />

            <path
              className="mascot-arc-eye"
              d="M30 20.5C32.4 13.5 41.6 13.5 44 20.5"
              stroke="#FFFFFF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              className="mascot-arc-eye"
              d="M56 20.5C58.4 13.5 67.6 13.5 70 20.5"
              stroke="#FFFFFF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />

            <g className="mascot-paw-wave">
              <ellipse cx="83.5" cy="21.5" rx="4.6" ry="3.8" fill="#FFFFFF" />
              <circle cx="78.8" cy="18.2" r="1.5" fill="#FFFFFF" />
              <circle cx="81.8" cy="15.7" r="1.55" fill="#FFFFFF" />
              <circle cx="85.4" cy="15.8" r="1.55" fill="#FFFFFF" />
              <circle cx="88.3" cy="18.3" r="1.45" fill="#FFFFFF" />
            </g>
          </svg>
        )}

        {mood === "happy" && (
          <svg
            className="mascot-svg"
            width="106"
            height="32"
            viewBox="0 0 106 32"
            fill="none"
          >
            <defs>
              <radialGradient id="mascot-happy-halo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(165, 216, 255, 0.65)" />
                <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
              </radialGradient>
            </defs>

            <ellipse cx="40" cy="17" rx="13" ry="11" fill="url(#mascot-happy-halo)" />
            <ellipse cx="66" cy="17" rx="13" ry="11" fill="url(#mascot-happy-halo)" />

            <path
              className="mascot-arc-eye"
              d="M33 20.5C35.4 13.5 44.6 13.5 47 20.5"
              stroke="#FFFFFF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              className="mascot-arc-eye"
              d="M59 20.5C61.4 13.5 70.6 13.5 73 20.5"
              stroke="#FFFFFF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />

            <path
              className="mascot-sparkle"
              d="M20 11L21.1 13.9L24 15L21.1 16.1L20 19L18.9 16.1L16 15L18.9 13.9L20 11Z"
              fill="#7DD3FC"
            />
            <path
              className="mascot-sparkle mascot-sparkle-delay"
              d="M86 9L87.1 11.9L90 13L87.1 14.1L86 17L84.9 14.1L82 13L84.9 11.9L86 9Z"
              fill="#C4B5FD"
            />
          </svg>
        )}

        {mood === "awake" && (
          <svg
            className="mascot-svg"
            width="92"
            height="32"
            viewBox="0 0 92 32"
            fill="none"
          >
            <defs>
              <radialGradient id="mascot-awake-halo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(147, 197, 253, 0.42)" />
                <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
              </radialGradient>
            </defs>

            <g className="mascot-awake-glance">
              <ellipse cx="34" cy="16" rx="11" ry="11" fill="url(#mascot-awake-halo)" />
              <ellipse cx="58" cy="16" rx="11" ry="11" fill="url(#mascot-awake-halo)" />
              <rect
                className="mascot-pill-eye"
                x="30.5"
                y="9.5"
                width="7"
                height="13"
                rx="3.5"
                fill="#FFFFFF"
              />
              <rect
                className="mascot-pill-eye"
                x="54.5"
                y="9.5"
                width="7"
                height="13"
                rx="3.5"
                fill="#FFFFFF"
              />
            </g>
          </svg>
        )}

        {mood === "sleepy" && (
          <svg
            className="mascot-svg"
            width="92"
            height="32"
            viewBox="0 0 92 32"
            fill="none"
          >
            <rect
              className="mascot-sleepy-eye"
              x="29.5"
              y="15"
              width="9.5"
              height="4.4"
              rx="2.2"
              fill="#E2E8F0"
            />
            <rect
              className="mascot-sleepy-eye"
              x="53"
              y="15"
              width="9.5"
              height="4.4"
              rx="2.2"
              fill="#E2E8F0"
            />
          </svg>
        )}

        {mood === "sleeping" && (
          <svg
            className="mascot-svg"
            width="106"
            height="32"
            viewBox="0 0 106 32"
            fill="none"
          >
            <path
              className="mascot-sleep-arc"
              d="M32 16.5C34.2 20.5 41.8 20.5 44 16.5"
              stroke="rgba(226, 232, 240, 0.86)"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              className="mascot-sleep-arc"
              d="M56 16.5C58.2 20.5 65.8 20.5 68 16.5"
              stroke="rgba(226, 232, 240, 0.86)"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <text
              className="mascot-zzz mascot-zzz-1"
              x="76"
              y="17"
              fill="rgba(186, 230, 253, 0.82)"
              fontSize="9"
              fontWeight="700"
            >
              z
            </text>
            <text
              className="mascot-zzz mascot-zzz-2"
              x="84"
              y="12"
              fill="rgba(196, 181, 253, 0.72)"
              fontSize="11"
              fontWeight="700"
            >
              Z
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}
