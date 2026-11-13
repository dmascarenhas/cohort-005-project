import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import {
  claimSeat,
  enrollThroughPurchase,
  SEAT_ON_HOLD,
} from "./enrollments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 10, 13, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function isEnrolled(userId: number) {
  return Boolean(
    db
      .select()
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.userId, userId),
          eq(schema.enrollments.courseId, base.course.id)
        )
      )
      .get()
  );
}

/** A Team Licence bought by `buyerId`, with `seats` Seats coded SEAT-0… */
function buyTeamLicence(buyerId: number, seats: number, country: string | null = null) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: buyerId,
      courseId: base.course.id,
      amountPaid: 7900 * seats,
      country,
    })
    .returning()
    .get();
  for (let i = 0; i < seats; i++) {
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${i}`,
        purchaseId: purchase.id,
      })
      .run();
  }
  return purchase;
}

describe("enrollThroughPurchase", () => {
  it("records the Individual Purchase, enrolls the buyer and tells the course's owner", () => {
    const result = enrollThroughPurchase(db, base.user.id, base.course.id, 4900, "GB");

    expect(result.purchase).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 4900,
      country: "GB",
    });
    expect(isEnrolled(base.user.id)).toBe(true);
    expect(result.notifications).toEqual([
      {
        workflow: "new-enrollment",
        recipients: [expect.objectContaining({ id: String(base.instructor.id) })],
        actor: expect.objectContaining({ id: String(base.user.id) }),
        data: {
          actorName: "Test User",
          courseTitle: "Test Course",
          url: `/instructor/${base.course.id}/students`,
        },
      },
    ]);
  });

  it("doesn't tell an Instructor who buys their own course", () => {
    const result = enrollThroughPurchase(db, base.instructor.id, base.course.id, 0, null);

    expect(isEnrolled(base.instructor.id)).toBe(true);
    expect(result.notifications).toEqual([]);
  });

  it("refuses a buyer who is already enrolled", () => {
    enrollThroughPurchase(db, base.user.id, base.course.id, 4900, null);

    expect(() =>
      enrollThroughPurchase(db, base.user.id, base.course.id, 4900, null)
    ).toThrow("User is already enrolled in this course");
  });
});

describe("claimSeat", () => {
  it("enrolls the Student, tells the Team Admin how many Seats are left, and tells the owner", () => {
    const teamAdmin = addStudent("Tara Admin");
    buyTeamLicence(teamAdmin.id, 3);
    const student = addStudent("Sam Student");

    const result = claimSeat(db, "SEAT-1", student.id, "", NOW);

    expect(result.ok).toBe(true);
    expect(isEnrolled(student.id)).toBe(true);
    expect(result.ok && result.notifications).toEqual([
      {
        workflow: "seat-claimed",
        recipients: [expect.objectContaining({ id: String(teamAdmin.id) })],
        actor: expect.objectContaining({ id: String(student.id) }),
        data: {
          actorName: "Sam Student",
          courseTitle: "Test Course",
          unclaimedSeats: 2,
          totalSeats: 3,
          url: "/team",
        },
      },
      {
        workflow: "new-enrollment",
        recipients: [expect.objectContaining({ id: String(base.instructor.id) })],
        actor: expect.objectContaining({ id: String(student.id) }),
        data: {
          actorName: "Sam Student",
          courseTitle: "Test Course",
          url: `/instructor/${base.course.id}/students`,
        },
      },
    ]);
  });

  it("counts down the unclaimed Seats with each claim", () => {
    const teamAdmin = addStudent("Tara Admin");
    buyTeamLicence(teamAdmin.id, 2);
    claimSeat(db, "SEAT-0", addStudent("First").id, "", NOW);

    const result = claimSeat(db, "SEAT-1", addStudent("Second").id, "", NOW);

    const seatClaimed = result.ok
      ? result.notifications.find((n) => n.workflow === "seat-claimed")
      : undefined;
    expect(seatClaimed?.data).toMatchObject({ unclaimedSeats: 0, totalSeats: 2 });
  });

  it("doesn't tell a Team Admin about claiming their own Seat, but still tells the owner", () => {
    const teamAdmin = addStudent("Tara Admin");
    buyTeamLicence(teamAdmin.id, 2);

    const result = claimSeat(db, "SEAT-0", teamAdmin.id, "", NOW);

    expect(result.ok && result.notifications.map((n) => n.workflow)).toEqual([
      "new-enrollment",
    ]);
  });

  it("doesn't tell an Instructor who claims a Seat on their own course", () => {
    const teamAdmin = addStudent("Tara Admin");
    buyTeamLicence(teamAdmin.id, 2);

    const result = claimSeat(db, "SEAT-0", base.instructor.id, "", NOW);

    expect(result.ok && result.notifications.map((n) => n.workflow)).toEqual([
      "seat-claimed",
    ]);
  });

  it("refuses a Seat on hold and notifies nobody", () => {
    const teamAdmin = addStudent("Tara Admin");
    const licence = buyTeamLicence(teamAdmin.id, 2);
    db.insert(schema.refunds)
      .values({
        purchaseId: licence.id,
        status: RefundStatus.Open,
        reason: "Bought too many seats",
        requestedAt: NOW.toISOString(),
      })
      .run();
    const student = addStudent("Sam Student");

    const result = claimSeat(db, "SEAT-0", student.id, "", NOW);

    expect(result).toEqual({ ok: false, error: SEAT_ON_HOLD });
    expect(isEnrolled(student.id)).toBe(false);
  });

  it("keeps the existing refusals", () => {
    const teamAdmin = addStudent("Tara Admin");
    buyTeamLicence(teamAdmin.id, 2, "GB");
    const student = addStudent("Sam Student");

    expect(claimSeat(db, "NOPE", student.id, "GB", NOW)).toEqual({
      ok: false,
      error: "Coupon not found",
    });
    expect(claimSeat(db, "SEAT-0", student.id, "US", NOW)).toEqual({
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    });

    claimSeat(db, "SEAT-0", student.id, "GB", NOW);
    expect(claimSeat(db, "SEAT-0", addStudent("Other").id, "GB", NOW)).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
    expect(claimSeat(db, "SEAT-1", student.id, "GB", NOW)).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });
});
