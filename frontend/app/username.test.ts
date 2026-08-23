import { describe, expect, it } from "vitest";
import { isValidUsername } from "./username";

describe("username validation", () => {
  it.each(["tester", "tester.name", "tester_name", "tester-name", "7tester"])(
    "accepts the canonical username %s",
    (username) => expect(isValidUsername(username)).toBe(true),
  );

  it.each([
    "Tester",
    " tester",
    "tester ",
    "new tester",
    "new%tester",
    "_tester",
    "ab",
    "a".repeat(33),
  ])("rejects the non-canonical username %s", (username) => {
    expect(isValidUsername(username)).toBe(false);
  });
});
