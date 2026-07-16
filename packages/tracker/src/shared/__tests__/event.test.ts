import { describe, expect, test } from "vitest";
import { sanitizeTrackEvent } from "../event";

describe("sanitizeTrackEvent", () => {
  test("accepts valid name and props", () => {
    const r = sanitizeTrackEvent({
      name: "signup_click",
      category: "cta",
      props: { plan: "pro", empty: "" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.name).toBe("signup_click");
      expect(JSON.parse(r.event.propsJson)).toEqual({
        category: "cta",
        plan: "pro",
      });
    }
  });

  test("rejects invalid names", () => {
    expect(sanitizeTrackEvent({ name: "" }).ok).toBe(false);
    expect(sanitizeTrackEvent({ name: "1bad" }).ok).toBe(false);
    expect(sanitizeTrackEvent({ name: "has space" }).ok).toBe(false);
  });

  test("caps props at 8 and truncates values", () => {
    const props: Record<string, string> = {};
    for (let i = 0; i < 12; i++) props[`k${i}`] = "v".repeat(200);
    const r = sanitizeTrackEvent({ name: "evt", props });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const obj = JSON.parse(r.event.propsJson);
      expect(Object.keys(obj).length).toBe(8);
      expect(Object.values(obj)[0].length).toBe(128);
    }
  });
});
