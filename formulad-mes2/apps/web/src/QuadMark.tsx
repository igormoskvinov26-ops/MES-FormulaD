export function QuadMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 36" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13" cy="27" r="8" strokeWidth="3.4" />
      <circle cx="51" cy="27" r="8" strokeWidth="3.4" />
      <path d="M3 22 L9 15 L21 15 L25 9 L39 9 L43 15 L55 15 L61 22" strokeWidth="2.4" />
      <path d="M37 9 L37 3 M29 3 H45" strokeWidth="2.4" />
    </svg>
  );
}
