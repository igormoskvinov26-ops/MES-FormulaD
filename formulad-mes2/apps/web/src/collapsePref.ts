export function createCollapsePref({ key, attr, event, narrowPx }: { key: string; attr: string; event: string; narrowPx: number }) {
  function stored(): 'collapsed' | 'expanded' | null {
    try {
      const v = localStorage.getItem(key);
      return v === 'collapsed' || v === 'expanded' ? v : null;
    } catch {
      return null;
    }
  }

  function apply(collapsed: boolean) {
    const root = document.documentElement;
    if (collapsed) root.setAttribute(attr, 'collapsed');
    else root.removeAttribute(attr);
    window.dispatchEvent(new Event(event));
  }

  return {
    isCollapsed: () => document.documentElement.getAttribute(attr) === 'collapsed',

    init() {
      const sync = () => {
        const pref = stored();
        apply(pref ? pref === 'collapsed' : window.innerWidth < narrowPx);
      };
      sync();
      window.addEventListener('resize', () => {
        if (!stored()) sync();
      });
    },

    set(collapsed: boolean) {
      try {
        localStorage.setItem(key, collapsed ? 'collapsed' : 'expanded');
      } catch {
        /* no localStorage */
      }
      apply(collapsed);
    },

    subscribe(listener: () => void) {
      window.addEventListener(event, listener);
      return () => window.removeEventListener(event, listener);
    },
  };
}
