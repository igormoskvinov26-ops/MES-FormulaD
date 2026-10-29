/** Фирменный знак — силуэт квадроцикла, линией, как на техническом чертеже.
    Цвет задаётся через currentColor, чтобы использоваться и в красном, и в графите. */
export function QuadMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 36"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Колёса — толстый штрих имитирует внедорожную шину. */}
      <circle cx="13" cy="27" r="8" strokeWidth="3.4" />
      <circle cx="51" cy="27" r="8" strokeWidth="3.4" />
      {/* Угловатые крылья над колёсами и низкий корпус. */}
      <path d="M3 22 L9 15 L21 15 L25 9 L39 9 L43 15 L55 15 L61 22" strokeWidth="2.4" />
      {/* Прямой руль квадроцикла. */}
      <path d="M37 9 L37 3 M29 3 H45" strokeWidth="2.4" />
    </svg>
  );
}
