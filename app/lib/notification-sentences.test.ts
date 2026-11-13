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

// ── Refund decisions (#12) ──
describe("refund decision sentences", () => {
  const text = (key: string, data: unknown) => {
    const described = describeNotification(key, data);
    return described && sentenceText(described.parts);
  };

  it("tells the buyer an approved Refund Request's amount", () => {
    expect(
      text("refund-request-approved", {
        courseTitle: "Intro to TypeScript",
        amount: "$49.00",
        url: "/courses/intro",
      })
    ).toBe(
      "Your Refund Request for Intro to TypeScript was approved. $49.00 is on its way back to you."
    );
  });

  it("quotes the note on a declined Refund Request", () => {
    expect(
      text("refund-request-declined", {
        courseTitle: "Intro to TypeScript",
        note: "You finished it",
        url: "/courses/intro",
      })
    ).toBe(
      'Your Refund Request for Intro to TypeScript was declined: "You finished it". You can raise a new one.'
    );
  });

  it("counts the cancelled Unclaimed Seats on an approved Team Licence", () => {
    expect(
      text("team-licence-refund-request-approved", {
        courseTitle: "Intro",
        amount: "$237.00",
        cancelledSeats: 1,
        url: "/team",
      })
    ).toBe(
      "Your Refund Request for the Intro Team Licence was approved. $237.00 is on its way back to you, and its 1 Unclaimed Seat can no longer be claimed."
    );
  });

  it("says a declined Team Licence's Seats can be claimed again", () => {
    expect(
      text("team-licence-refund-request-declined", {
        courseTitle: "Intro",
        note: "In use",
        url: "/team",
      })
    ).toBe(
      'Your Refund Request for the Intro Team Licence was declined: "In use". Its Unclaimed Seats can be claimed again.'
    );
  });

  it("tells the owner which Student lost an Enrollment, or how many Seats went", () => {
    expect(
      text("enrollment-refunded", {
        courseTitle: "Intro",
        purchaseType: "individual",
        studentName: "Emma Wilson",
        url: "/instructor/1/students",
      })
    ).toBe("A Refund Request for Intro was approved. Emma Wilson no longer has an Enrollment.");
    expect(
      text("enrollment-refunded", {
        courseTitle: "Intro",
        purchaseType: "team-licence",
        cancelledSeats: 3,
        url: "/instructor/1/students",
      })
    ).toBe("A Refund Request for Intro was approved. 3 Unclaimed Seats were cancelled.");
  });

  it("puts the course and the Student in bold", () => {
    expect(
      describeNotification("enrollment-refunded", {
        courseTitle: "Intro",
        purchaseType: "individual",
        studentName: "Emma Wilson",
        url: "/instructor/1/students",
      })?.parts
    ).toEqual([
      "A Refund Request for ",
      { strong: "Intro" },
      " was approved. ",
      { strong: "Emma Wilson" },
      " no longer has an Enrollment.",
    ]);
  });
});
// ── end refund decisions ──
