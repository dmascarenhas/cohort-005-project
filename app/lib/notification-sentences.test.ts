import { describe, expect, it } from "vitest";
import { describeNotification, sentenceText } from "./notification-sentences";

describe("describeNotification", () => {
  it("says what role a Platform Admin gave you, with the role in bold", () => {
    const described = describeNotification("role-changed", {
      newRole: "instructor",
      url: "/dashboard",
    });

    expect(described).toEqual({
      icon: "role",
      parts: ["A Platform Admin made you ", { strong: "an Instructor" }, "."],
      url: "/dashboard",
    });
  });

  it.each([
    ["student", "A Platform Admin made you a Student."],
    ["admin", "A Platform Admin made you a Platform Admin."],
  ])("reads naturally for the %s role", (newRole, sentence) => {
    const described = describeNotification("role-changed", {
      newRole,
      url: "/dashboard",
    });

    expect(described && sentenceText(described.parts)).toBe(sentence);
  });

  it("skips a workflow Cadence doesn't know", () => {
    expect(describeNotification("something-else", { url: "/" })).toBeNull();
  });

  it("skips data that doesn't match the workflow's contract", () => {
    expect(
      describeNotification("role-changed", { newRole: "wizard", url: "/" })
    ).toBeNull();
    expect(describeNotification("role-changed", null)).toBeNull();
  });
});
