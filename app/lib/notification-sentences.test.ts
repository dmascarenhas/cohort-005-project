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

describe("describeNotification: Seat claimed and New Enrollment", () => {
  it("tells the Team Admin who claimed a Seat and how many are left", () => {
    const described = describeNotification("seat-claimed", {
      actorName: "Sam Student",
      courseTitle: "Test Course",
      unclaimedSeats: 2,
      totalSeats: 3,
      url: "/team",
    });

    expect(described).toEqual({
      icon: "seat",
      parts: [
        { strong: "Sam Student" },
        " claimed a Seat on your Team Licence for ",
        { strong: "Test Course" },
        ". 2 of 3 Seats are still unclaimed.",
      ],
      url: "/team",
    });
  });

  it("tells the course's owner who enrolled", () => {
    const described = describeNotification("new-enrollment", {
      actorName: "Sam Student",
      courseTitle: "Test Course",
      url: "/instructor/1/students",
    });

    expect(described && sentenceText(described.parts)).toBe(
      "Sam Student enrolled on Test Course."
    );
    expect(described?.url).toBe("/instructor/1/students");
  });
});
