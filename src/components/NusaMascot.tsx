interface NusaMascotProps {
  size?: number;
}

export function NusaMascot({ size = 20 }: NusaMascotProps) {
  return (
    <svg
      className="nusa-mascot"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="Nusa mascot"
    >
      <defs>
        <linearGradient id="nusa-rim" x1="8" y1="54" x2="56" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14C8FF" />
          <stop offset="52%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <path
        d="M12 24C12 15 16 10 21 12L26 16H38L43 12C48 10 52 15 52 24V38C52 48.5 44 54 32 54C20 54 12 48.5 12 38V24Z"
        fill="#0D0F14"
        stroke="url(#nusa-rim)"
        strokeWidth="3.5"
      />
      <ellipse className="nusa-mascot-eye" cx="24.5" cy="32" rx="3.4" ry="5.6" fill="#FFFFFF" />
      <ellipse className="nusa-mascot-eye" cx="39.5" cy="32" rx="3.4" ry="5.6" fill="#FFFFFF" />
    </svg>
  );
}
