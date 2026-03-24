import { describe, expect, it } from "vitest";

describe("PIN gate secret", () => {
  it("VITE_APP_PIN env variable is set", () => {
    const pin = process.env.VITE_APP_PIN;
    expect(pin).toBeDefined();
    expect(pin!.length).toBeGreaterThan(0);
  });
});
