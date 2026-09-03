import { describe, it, expect } from "vitest";
import { parsePriceToNumber, comparePrices } from "./price";

describe("parsePriceToNumber", () => {
  it("parses a plain dollar amount", () => {
    expect(parsePriceToNumber("$59.99")).toBe(59.99);
  });

  it("parses an amount with a thousands separator", () => {
    expect(parsePriceToNumber("$1,299.99")).toBe(1299.99);
  });

  it("returns null for 'Free to Play' — a real price, not a number", () => {
    expect(parsePriceToNumber("Free to Play")).toBeNull();
  });

  it("returns null for null/undefined/empty input", () => {
    expect(parsePriceToNumber(null)).toBeNull();
    expect(parsePriceToNumber(undefined)).toBeNull();
    expect(parsePriceToNumber("")).toBeNull();
  });
});

describe("comparePrices", () => {
  it("says the DRM-free copy is cheaper", () => {
    expect(comparePrices("$59.99", "$39.99")).toEqual({ amount: 20, cheaper: "free" });
  });

  it("says the locked copy is cheaper", () => {
    expect(comparePrices("$9.99", "$19.99")).toEqual({ amount: 10, cheaper: "locked" });
  });

  it("reports the same price with a zero amount", () => {
    expect(comparePrices("$29.99", "$29.99")).toEqual({ amount: 0, cheaper: "same" });
  });

  it("returns null when either price is unparseable", () => {
    expect(comparePrices("Free to Play", "$9.99")).toBeNull();
    expect(comparePrices("$9.99", null)).toBeNull();
    expect(comparePrices(null, null)).toBeNull();
  });
});
