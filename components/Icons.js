// Simple original icons (24x24, currentColor).
const I = ({ children, size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children}
  </svg>
);

export const LadderIcon = (p) => (
  <I {...p}>
    <path d="M7 3v18M17 3v18" strokeWidth="3" />
    <circle cx="7" cy="8" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="17" cy="16" r="1.2" fill="currentColor" stroke="none" />
  </I>
);
export const MapIcon = (p) => (
  <I {...p}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </I>
);
export const RefreshIcon = (p) => (
  <I {...p}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </I>
);
export const ReverseIcon = (p) => (
  <I {...p}>
    <path d="M7 20V4M3 8l4-4 4 4" />
    <path d="M17 4v16M13 16l4 4 4-4" />
  </I>
);
export const CloseIcon = (p) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
);
export const ChevronsLeft = (p) => (
  <I {...p}>
    <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
  </I>
);
export const ChevronsRight = (p) => (
  <I {...p}>
    <path d="M13 7l5 5-5 5M6 7l5 5-5 5" />
  </I>
);
export const ChevronLeft = (p) => (
  <I {...p}>
    <path d="M15 18l-6-6 6-6" />
  </I>
);
export const ChevronRight = (p) => (
  <I {...p}>
    <path d="M9 18l6-6-6-6" />
  </I>
);
export const SearchIcon = (p) => (
  <I {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.8-4.8" />
  </I>
);
export const InfoIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </I>
);
