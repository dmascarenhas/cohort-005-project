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

describe("describeNotification: course owners", () => {
  it("says who rated the course and the score, with names in bold", () => {
    expect(
      describeNotification("course-rated", {
        actorName: "Emma Wilson",
        courseTitle: "Introduction to TypeScript",
        rating: 4,
        url: "/instructor/1",
      })
    ).toEqual({
      icon: "rating",
      parts: [
        { strong: "Emma Wilson" },
        " rated ",
        { strong: "Introduction to TypeScript" },
        " 4/5.",
      ],
      url: "/instructor/1",
    });
  });

  it.each([
    ["published", "A Platform Admin published Intro to TS."],
    ["archived", "A Platform Admin archived Intro to TS."],
    ["draft", "A Platform Admin moved Intro to TS to Draft."],
  ])("words a change to %s", (newStatus, sentence) => {
    const described = describeNotification("course-status-changed", {
      courseTitle: "Intro to TS",
      newStatus,
      url: "/instructor/1",
    });

    expect(described?.icon).toBe("course-status");
    expect(described && sentenceText(described.parts)).toBe(sentence);
  });
});
