/** Значки для плашек-счётчиков на плане — линией, в том же языке, что QuadMark.tsx. */
type IconProps = { className?: string };

function base(className?: string) {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3 L21 8 L12 13 L3 8 Z" />
      <path d="M3 13 L12 18 L21 13" />
      <path d="M3 17.5 L12 22.5 L21 17.5" />
    </svg>
  );
}

export function IconHourglass({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 3 H18 M6 21 H18" />
      <path d="M6 3 C6 9 18 9 18 3 M6 21 C6 15 18 15 18 21" />
    </svg>
  );
}

export function IconBolt({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M13 2 L5 14 H11 L10 22 L19 10 H13 Z" />
    </svg>
  );
}

export function IconCheckBox({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 12.5 L11 15.5 L16.5 9" />
    </svg>
  );
}

export function IconShieldCheck({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3 L19 6 V11 C19 16 16 19.5 12 21 C8 19.5 5 16 5 11 V6 Z" />
      <path d="M8.5 11.5 L11 14 L15.5 9" />
    </svg>
  );
}
