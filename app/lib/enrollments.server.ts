import { and, eq } from "drizzle-orm";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  users,
} from "~/db/schema";
import { notify, type Notification } from "~/lib/notifications";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Enrolling ───
// The two ways a Student gets an Enrollment: an Individual Purchase, or
// claiming a Seat on someone's Team Licence. Each returns the Notifications it
// produces (New Enrollment to the course's owner, and Seat claimed to the Team
// Licence's buyer). Every function takes the database first, so tests can hand
// in an in-memory one.

type Course = typeof courses.$inferSelect;
type User = typeof users.$inferSelect;

function getUser(db: Db, userId: number): User | undefined {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

function findEnrollment(db: Db, userId: number, courseId: number) {
  return db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

/** New Enrollment, for the course's owner, unless they enrolled themselves. */
function newEnrollment(db: Db, student: User, course: Course): Notification[] {
  const owner = getUser(db, course.instructorId);
  if (!owner) return [];

  return notify("new-enrollment", [owner], student, {
    actorName: student.name,
    courseTitle: course.title,
    url: `/instructor/${course.id}/students`,
  });
}

/**
 * A Student buys a course for themselves: an Individual Purchase and the
 * Enrollment it gives them. Throws if they're already enrolled or the course
 * doesn't exist; the purchase page checks both first.
 */
export function enrollThroughPurchase(
  db: Db,
  buyerId: number,
  courseId: number,
  amountPaid: number,
  country: string | null
) {
  if (findEnrollment(db, buyerId, courseId)) {
    throw new Error("User is already enrolled in this course");
  }

  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) {
    throw new Error("Course not found");
  }

  const { purchase, enrollment } = db.transaction((tx) => ({
    purchase: tx
      .insert(purchases)
      .values({ userId: buyerId, courseId, amountPaid, country })
      .returning()
      .get(),
    enrollment: tx
      .insert(enrollments)
      .values({ userId: buyerId, courseId })
      .returning()
      .get(),
  }));

  const buyer = getUser(db, buyerId);
  const notifications = buyer ? newEnrollment(db, buyer, course) : [];

  return { purchase, enrollment, notifications };
}

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimSeatResult =
  | {
      ok: true;
      enrollment: typeof enrollments.$inferSelect;
      notifications: Notification[];
    }
  | { ok: false; error: string };

/**
 * A Student claims a Seat by its code and gets an Enrollment. The Team
 * Licence's buyer hears how many Seats are left, and the course's owner hears
 * about the new Enrollment; nobody hears about their own claim.
 */
export function claimSeat(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  now: Date
): ClaimSeatResult {
  const seat = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!seat) {
    return { ok: false, error: "Coupon not found" };
  }

  if (seat.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "on_hold") {
    return { ok: false, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, error: SEAT_REFUNDED };
  }

  if (findEnrollment(db, userId, seat.courseId)) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const teamLicence = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();

  if (teamLicence?.country && teamLicence.country !== userCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  const enrollment = db.transaction((tx) => {
    tx.update(coupons)
      .set({ redeemedByUserId: userId, redeemedAt: now.toISOString() })
      .where(eq(coupons.id, seat.id))
      .run();

    return tx
      .insert(enrollments)
      .values({ userId, courseId: seat.courseId })
      .returning()
      .get();
  });

  const student = getUser(db, userId);
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();

  if (!student || !course) {
    return { ok: true, enrollment, notifications: [] };
  }

  const seats = db
    .select({ redeemedByUserId: coupons.redeemedByUserId })
    .from(coupons)
    .where(eq(coupons.purchaseId, seat.purchaseId))
    .all();
  const unclaimedSeats = seats.filter(
    (other) => other.redeemedByUserId === null
  ).length;

  const teamAdmin = teamLicence ? getUser(db, teamLicence.userId) : undefined;

  const seatClaimed = teamAdmin
    ? notify("seat-claimed", [teamAdmin], student, {
        actorName: student.name,
        courseTitle: course.title,
        unclaimedSeats,
        totalSeats: seats.length,
        url: "/team",
      })
    : [];

  return {
    ok: true,
    enrollment,
    notifications: [...seatClaimed, ...newEnrollment(db, student, course)],
  };
}
