/** Sidebar navigation icons — stroke-based, same visual language as QuadMark and StatIcons. */
type P = { className?: string };

const b = (className?: string) => ({
  className,
  viewBox: '0 0 20 20',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  width: 20,
  height: 20,
});

export function IconPlan({ className }: P) {
  return (
    <svg {...b(className)}>
      <rect x="3" y="2" width="14" height="16" rx="2" />
      <path d="M7 6h6M7 9.5h4M7 13h5" />
    </svg>
  );
}

export function IconImport({ className }: P) {
  return (
    <svg {...b(className)}>
      <path d="M10 3v10M6.5 9.5 10 13l3.5-3.5" />
      <path d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2" />
    </svg>
  );
}

export function IconStart({ className }: P) {
  return (
    <svg {...b(className)}>
      <polygon points="7,4 17,10 7,16" />
    </svg>
  );
}

export function IconStations({ className }: P) {
  return (
    <svg {...b(className)}>
      <rect x="2" y="3" width="6" height="6" rx="1" />
      <rect x="12" y="3" width="6" height="6" rx="1" />
      <rect x="2" y="11" width="6" height="6" rx="1" />
      <rect x="12" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}

export function IconComplete({ className }: P) {
  return (
    <svg {...b(className)}>
      <circle cx="10" cy="10" r="7" />
      <path d="M7 10l2 2 4-4" />
    </svg>
  );
}

export function IconFok({ className }: P) {
  return (
    <svg {...b(className)}>
      <path d="M10 2l5.5 2.5V9c0 4-2.5 6.5-5.5 8-3-1.5-5.5-4-5.5-8V4.5Z" />
      <path d="M7.5 9.5l2 2 3.5-3.5" />
    </svg>
  );
}

export function IconRework({ className }: P) {
  return (
    <svg {...b(className)}>
      <path d="M3 10a7 7 0 0112.5-4.3" />
      <path d="M17 10a7 7 0 01-12.5 4.3" />
      <path d="M15.5 2.5v3.2h-3.2M4.5 17.5v-3.2h3.2" />
    </svg>
  );
}

export function IconNcp({ className }: P) {
  return (
    <svg {...b(className)}>
      <path d="M10 3l7 4v6l-7 4-7-4V7z" />
      <path d="M10 8v3M10 13.5v.5" />
    </svg>
  );
}

export function IconIncoming({ className }: P) {
  return (
    <svg {...b(className)}>
      <path d="M4 8h12l1.5 9H2.5z" />
      <path d="M6 8V5a1 1 0 011-1h6a1 1 0 011 1v3" />
      <path d="M8 11.5h4" />
    </svg>
  );
}

export function IconReports({ className }: P) {
  return (
    <svg {...b(className)}>
      <path d="M4 17V7M8 17v-6M12 17V5M16 17v-4" />
    </svg>
  );
}
