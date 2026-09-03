// Decorative paw-print glyph used as a button/field icon to match the
// raccoon-turtle mascot theme (see Mascot.tsx).
export function PawIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      className="icon-paw"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle fill="currentColor" opacity="0.85" cx="12" cy="16" r="5" />
      <circle fill="currentColor" opacity="0.85" cx="5" cy="8" r="2.6" />
      <circle fill="currentColor" opacity="0.85" cx="19" cy="8" r="2.6" />
      <circle fill="currentColor" opacity="0.85" cx="8" cy="4" r="2.2" />
      <circle fill="currentColor" opacity="0.85" cx="16" cy="4" r="2.2" />
    </svg>
  );
}
