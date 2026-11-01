import { beforeEach, describe, expect, it } from "vitest";
import { guestSession } from "../lib/guest-session";

const key = "smart-catalogue-cart-session";
const legacy = "guest_0123456789abcdef01234567";

describe("guestSession", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("migrates an existing tab session to shared browser storage", () => {
    sessionStorage.setItem(key, legacy);
    expect(guestSession()).toBe(legacy);
    expect(localStorage.getItem(key)).toBe(legacy);
  });

  it("uses the same guest identity in a second tab of the browser profile", () => {
    localStorage.setItem(key, legacy);
    // A new tab has its own sessionStorage but shares origin localStorage.
    sessionStorage.clear();
    expect(guestSession()).toBe(legacy);
    expect(sessionStorage.getItem(key)).toBe(legacy);
  });

  it("preserves an already-open legacy tab's cart and order identity during migration", () => {
    localStorage.setItem(key, "guest_aaaaaaaaaaaaaaaaaaaaaaaa");
    sessionStorage.setItem(key, legacy);
    expect(guestSession()).toBe(legacy);
    expect(localStorage.getItem(key)).toBe(legacy);
  });

  it("does not accept a malformed shared identity", () => {
    localStorage.setItem(key, "not-a-guest-session");
    const session = guestSession();
    expect(session).toMatch(/^guest_[A-Za-z0-9]{16,128}$/);
    expect(session).not.toBe("not-a-guest-session");
  });
});
