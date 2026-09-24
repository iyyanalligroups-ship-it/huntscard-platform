// Decorative flowing-ribbon backdrop. The stops use the global dashboard
// accent variables so the login artwork follows the selected client theme.
export default function WaveBackdrop() {
  return (
    <svg
      className="wave-svg"
      viewBox="0 0 800 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--brand-accent)" />
          <stop offset="55%" stopColor="var(--brand-accent-2)" />
          <stop offset="100%" stopColor="var(--brand-accent)" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#waveGrad)" strokeLinecap="round">
        <path d="M -50 200 C 100 120, 220 260, 380 160 C 520 70, 640 230, 820 90" strokeWidth="1.5" opacity="0.55" />
        <path d="M -50 215 C 100 135, 220 275, 380 175 C 520 85, 640 245, 820 105" strokeWidth="1" opacity="0.4" />
        <path d="M -50 185 C 100 105, 220 245, 380 145 C 520 55, 640 215, 820 75" strokeWidth="1" opacity="0.4" />
        <path d="M -50 230 C 100 150, 220 290, 380 190 C 520 100, 640 260, 820 120" strokeWidth="0.75" opacity="0.28" />
        <path d="M -50 170 C 100 90, 220 230, 380 130 C 520 40, 640 200, 820 60" strokeWidth="0.75" opacity="0.28" />
      </g>
    </svg>
  );
}
