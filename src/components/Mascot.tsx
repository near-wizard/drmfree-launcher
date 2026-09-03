// A small whimsy touch for the header — a raccoon peeking out of a
// turtle shell. Purely decorative, no state or interaction.
export function Mascot() {
  return (
    <svg
      className="mascot"
      viewBox="0 0 32 32"
      role="img"
      aria-label="DRM-Free Launcher mascot: a raccoon in a turtle shell"
    >
      <defs>
        <radialGradient id="mascot-shell" cx="35%" cy="25%">
          <stop offset="0%" stopColor="var(--copper-light)" />
          <stop offset="60%" stopColor="var(--copper)" />
          <stop offset="100%" stopColor="var(--copper-dark)" />
        </radialGradient>
        <radialGradient id="mascot-fur" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#9a9488" />
          <stop offset="100%" stopColor="#5c584f" />
        </radialGradient>
      </defs>

      {/* feet peeking from under the shell */}
      <circle cx="6.5" cy="25.5" r="2.2" fill="url(#mascot-fur)" />
      <circle cx="25.5" cy="25.5" r="2.2" fill="url(#mascot-fur)" />

      {/* shell */}
      <ellipse cx="16" cy="21" rx="12" ry="9" fill="url(#mascot-shell)" stroke="#4a3410" strokeWidth="1" />
      <path
        d="M16 12.5 V29.5 M5 21 H27 M9 15 L23 27 M23 15 L9 27"
        stroke="#4a3410"
        strokeWidth="0.6"
        opacity="0.45"
        fill="none"
      />

      {/* ears */}
      <path d="M9 8 L7 3 L12.5 6.5 Z" fill="url(#mascot-fur)" stroke="#3a3730" strokeWidth="0.6" />
      <path d="M23 8 L25 3 L19.5 6.5 Z" fill="url(#mascot-fur)" stroke="#3a3730" strokeWidth="0.6" />

      {/* head */}
      <circle cx="16" cy="12" r="7.5" fill="url(#mascot-fur)" stroke="#3a3730" strokeWidth="0.8" />

      {/* mask */}
      <path
        d="M9.2 10.3 Q16 14.2 22.8 10.3 Q22 13.8 16 14.8 Q10 13.8 9.2 10.3 Z"
        fill="#2b2822"
      />

      {/* glowing eyes */}
      <circle cx="13" cy="11.3" r="1.3" fill="var(--glow-green)" style={{ filter: "drop-shadow(0 0 2px var(--glow-green))" }} />
      <circle cx="19" cy="11.3" r="1.3" fill="var(--glow-green)" style={{ filter: "drop-shadow(0 0 2px var(--glow-green))" }} />

      {/* snout */}
      <ellipse cx="16" cy="15.6" rx="2.2" ry="1.6" fill="#8a8478" />
      <circle cx="16" cy="15.1" r="0.7" fill="#2b2822" />
    </svg>
  );
}
