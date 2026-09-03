import { describe, expect, it } from "vitest";

import { DEFAULT_PUBLIC_FEED_CANDIDATES } from "../src/client/public-feed.js";

describe("default public feed", () => {
  it("contains real, unique Solana candidates for signed-out browsing", () => {
    expect(DEFAULT_PUBLIC_FEED_CANDIDATES.length).toBeGreaterThanOrEqual(3);
    expect(
      DEFAULT_PUBLIC_FEED_CANDIDATES.every(
        (candidate) => candidate.chain === "SOLANA",
      ),
    ).toBe(true);
    expect(
      new Set(
        DEFAULT_PUBLIC_FEED_CANDIDATES.map(
          (candidate) => candidate.assetId,
        ),
      ).size,
    ).toBe(DEFAULT_PUBLIC_FEED_CANDIDATES.length);
  });
});
