import { describe, expect, it } from "vitest";
import { cadenceEpoch } from "../src/domain/epoch.js";

describe("cadence epochs", () => {
  const now = new Date("2026-07-25T23:59:59.000Z");

  it("creates distinct daily, weekly, and monthly session periods", () => {
    expect(cadenceEpoch("daily", now)).toBe("D:2026-07-25");
    expect(cadenceEpoch("weekly", now)).toBe("W:2026-W30");
    expect(cadenceEpoch("monthly", now)).toBe("M:2026-07");
  });

  it("starts the weekly period on Monday in the account timezone", () => {
    const sundayNightUtc = new Date("2026-08-30T23:30:00.000Z");

    expect(cadenceEpoch("weekly", sundayNightUtc, "UTC")).toBe("W:2026-W35");
    expect(cadenceEpoch("weekly", sundayNightUtc, "Europe/Lisbon")).toBe(
      "W:2026-W36"
    );
  });
});
