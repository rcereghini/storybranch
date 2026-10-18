// Small stroke icons for the shell. Decorative: the button or link that holds
// one always has its own text or aria-label.
const paths = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  discover: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  adventures: (
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </>
  ),
  create: <path d="M12 5v14M5 12h14" />,
  sparkle: (
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
  ),
  assets: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </>
  ),
  admin: <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  signOut: (
    <>
      <path d="M15 4h4v16h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="brand-logo"
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path className="stem" d="M14 25V12" />
      <path className="stem" d="M14 16c-4 0-7-3-7-7" />
      <path className="stem" d="M14 13c4 0 7-3 7-7" />
      <circle className="bud" cx="7" cy="8" r="2.5" />
      <circle className="bud" cx="21" cy="5" r="2.5" />
    </svg>
  );
}
