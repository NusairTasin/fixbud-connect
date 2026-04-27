import { describe, it, expect } from "vitest";
import { isValidBDPhone, normaliseBDPhone } from "./phone";

describe("isValidBDPhone", () => {
  it("rejects empty string", () => {
    expect(isValidBDPhone("")).toBe(false);
  });

  it("accepts 01712345678 (bare 0-prefix form)", () => {
    expect(isValidBDPhone("01712345678")).toBe(true);
  });

  it("accepts +8801712345678 (E.164 form)", () => {
    expect(isValidBDPhone("+8801712345678")).toBe(true);
  });

  it("accepts 8801712345678 (880 prefix form)", () => {
    expect(isValidBDPhone("8801712345678")).toBe(true);
  });

  it("rejects 01212345678 (invalid operator digit 2)", () => {
    expect(isValidBDPhone("01212345678")).toBe(false);
  });

  it("rejects 0171234567 (too short — 10 digits)", () => {
    expect(isValidBDPhone("0171234567")).toBe(false);
  });

  it("rejects 017123456789 (too long — 12 digits)", () => {
    expect(isValidBDPhone("017123456789")).toBe(false);
  });
});

describe("normaliseBDPhone", () => {
  it("normalises 01712345678 to +8801712345678", () => {
    expect(normaliseBDPhone("01712345678")).toBe("+8801712345678");
  });

  it("normalises +8801712345678 to +8801712345678 (already E.164)", () => {
    expect(normaliseBDPhone("+8801712345678")).toBe("+8801712345678");
  });

  it("normalises 8801712345678 to +8801712345678", () => {
    expect(normaliseBDPhone("8801712345678")).toBe("+8801712345678");
  });

  it("throws for invalid input", () => {
    expect(() => normaliseBDPhone("01212345678")).toThrow();
  });
});
