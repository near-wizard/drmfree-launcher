// Both Steam's appdetails ("$59.99") and GOG's catalog ("$9.99")
// return pre-formatted USD strings, not raw numeric values — this app
// has no other currency/locale handling anywhere else either, so a
// simple strip-and-parse is consistent with existing scope rather
// than a gap. Returns null for anything that isn't a plain dollar
// amount (including "Free to Play", which is a real, valid price —
// just not a number to do arithmetic on here).
export function parsePriceToNumber(price: string | null | undefined): number | null {
  if (!price) return null;
  const match = price.match(/[\d,]+\.\d{2}/);
  if (!match) return null;
  const value = Number.parseFloat(match[0].replace(/,/g, ""));
  return Number.isNaN(value) ? null : value;
}

export interface PriceDelta {
  amount: number;
  cheaper: "locked" | "free" | "same";
}

// The actual "final figure" the compare view leads with — how much
// more or less the DRM-free copy costs, not just two prices sitting
// side by side for the reader to subtract themselves.
export function comparePrices(lockedPrice: string | null, gogPrice: string | null): PriceDelta | null {
  const locked = parsePriceToNumber(lockedPrice);
  const free = parsePriceToNumber(gogPrice);
  if (locked === null || free === null) return null;
  // Round to cents — floating-point subtraction on two already-rounded
  // dollar amounts (e.g. 19.99 - 9.99) routinely lands a bit off zero
  // (9.999999999999998), which would print as garbage past 2 decimals.
  const amount = Math.round(Math.abs(locked - free) * 100) / 100;
  if (locked === free) return { amount: 0, cheaper: "same" };
  return { amount, cheaper: locked > free ? "free" : "locked" };
}
