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

describe("describeNotification: Discussions", () => {
  const url = "/courses/test-course/lessons/3#discussion-9";

  it("says who asked a question, where", () => {
    const described = describeNotification("new-discussion-question", {
      actorName: "Emma Wilson",
      lessonTitle: "Generics",
      courseTitle: "Introduction to TypeScript",
      url: "/instructor/questions",
    });

    expect(described).toEqual({
      icon: "question",
      parts: [
        { strong: "Emma Wilson" },
        " asked a question on ",
        { strong: "Generics" },
        " in ",
        { strong: "Introduction to TypeScript" },
        ".",
      ],
      url: "/instructor/questions",
    });
  });

  it("says the Instructor answered your question", () => {
    const described = describeNotification(
      "instructor-answered-discussion-question",
      {
        actorName: "Sarah Chen",
        lessonTitle: "Generics",
        courseTitle: "Introduction to TypeScript",
        url,
      }
    );

    expect(described && sentenceText(described.parts)).toBe(
      "Sarah Chen answered your question on Generics in Introduction to TypeScript."
    );
    expect(described?.url).toBe(url);
  });

  it("says someone replied to your question", () => {
    const described = describeNotification("new-discussion-reply", {
      actorName: "James Park",
      lessonTitle: "Generics",
      url,
    });

    expect(described && sentenceText(described.parts)).toBe(
      "James Park replied to your question on Generics."
    );
  });
});
