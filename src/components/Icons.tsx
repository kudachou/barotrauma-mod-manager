import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function S({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconAnchor = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="5" r="2.2" />
    <path d="M12 7.2V21" />
    <path d="M5 12H2.5a9.5 9.5 0 0 0 19 0H19" />
  </S>
);

export const IconLibrary = (p: IconProps) => (
  <S {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" />
  </S>
);

export const IconLayers = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
    <path d="M3 12.5 12 17l9-4.5" />
    <path d="M3 17 12 21.5 21 17" />
  </S>
);

export const IconSettings = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2v.17a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-2.93-1.15l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.9 15H3.7a2 2 0 1 1 0-4h.17a1.7 1.7 0 0 0 1.15-2.93l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 10.8 3.9V3.7a2 2 0 1 1 4 0v.17a1.7 1.7 0 0 0 2.93 1.15l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 20.1 10h.17a2 2 0 1 1 0 4h-.17a1.7 1.7 0 0 0-1.57 1Z" />
  </S>
);

export const IconSearch = (p: IconProps) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </S>
);

export const IconRefresh = (p: IconProps) => (
  <S {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </S>
);

export const IconFolder = (p: IconProps) => (
  <S {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </S>
);

export const IconExternal = (p: IconProps) => (
  <S {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </S>
);

export const IconImage = (p: IconProps) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="m4 17 4.5-4.5 3.5 3.5 3-3L20 17" />
  </S>
);

export const IconClose = (p: IconProps) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </S>
);

export const IconCheck = (p: IconProps) => (
  <S {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </S>
);

export const IconAlert = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3.5 22 20H2L12 3.5Z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.4" r="0.6" fill="currentColor" />
  </S>
);

export const IconTrash = (p: IconProps) => (
  <S {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M10 11v6M14 11v6" />
  </S>
);

export const IconPlus = (p: IconProps) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);

export const IconGrip = (p: IconProps) => (
  <S {...p}>
    <circle cx="9" cy="6" r="1.2" fill="currentColor" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" />
    <circle cx="9" cy="18" r="1.2" fill="currentColor" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" />
  </S>
);

export const IconCopy = (p: IconProps) => (
  <S {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
  </S>
);

export const IconDownload = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3v12" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 20h16" />
  </S>
);

export const IconSave = (p: IconProps) => (
  <S {...p}>
    <path d="M4 6a2 2 0 0 1 2-2h9l5 5v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
    <path d="M8 4v5h7" />
    <rect x="8" y="13" width="8" height="7" rx="1" />
  </S>
);

export const IconPlay = (p: IconProps) => (
  <S {...p}>
    <path d="M7 4.8v14.4L19.5 12 7 4.8Z" />
  </S>
);

export const IconTag = (p: IconProps) => (
  <S {...p}>
    <path d="M3 12.4V5a2 2 0 0 1 2-2h7.4a2 2 0 0 1 1.42.59l7 7a2 2 0 0 1 0 2.82l-7.4 7.4a2 2 0 0 1-2.83 0l-7-7A2 2 0 0 1 3 12.4Z" />
    <circle cx="8" cy="8" r="1.4" />
  </S>
);

export const IconChevron = (p: IconProps) => (
  <S {...p}>
    <path d="m9 5 7 7-7 7" />
  </S>
);

export const IconInfo = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
  </S>
);

export const IconClock = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 1.8" />
  </S>
);
