import { and, eq } from "drizzle-orm";
import { courseRatings, courses, users, type CourseStatus } from "~/db/schema";
import { notify, type Notification } from "~/lib/notifications";
import { MAX_RATING, MIN_RATING } from "~/lib/ratings";
import type { Db } from "~/lib/refunds.server";

// ─── Courses ───
// Rating a course, and a Platform Admin changing a course's status. Each
// returns the Notifications it produces for the course's owner. Every
// function takes the database first, so tests can hand in an in-memory one.

type Failure = { ok: false; status: 400 | 404; error: string };

export type CourseChangeResult =
  | { ok: true; notifications: Notification[] }
  | Failure;

function getUser(db: Db, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

/**
 * Records a Student's rating of a course, or updates it if they have rated it
 * before. The course's owner hears about a first rating only: re-rates don't
 * notify.
 */
export function rateCourse(
  db: Db,
  studentId: number,
  courseId: number,
  rating: number,
  now: Date
): CourseChangeResult {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    return {
      ok: false,
      status: 400,
      error: `Rating must be a whole number between ${MIN_RATING} and ${MAX_RATING}.`,
    };
  }

  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) {
    return { ok: false, status: 404, error: "Course not found." };
  }

  const existing = db
    .select({ id: courseRatings.id })
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, studentId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();

  if (existing) {
    db.update(courseRatings)
      .set({ rating, updatedAt: now.toISOString() })
      .where(eq(courseRatings.id, existing.id))
      .run();
    return { ok: true, notifications: [] };
  }

  db.insert(courseRatings).values({ userId: studentId, courseId, rating }).run();

  const student = getUser(db, studentId);
  const owner = getUser(db, course.instructorId);
  if (!student || !owner) return { ok: true, notifications: [] };

  return {
    ok: true,
    notifications: notify("course-rated", [owner], student, {
      actorName: student.name,
      courseTitle: course.title,
      rating,
      url: `/instructor/${course.id}`,
    }),
  };
}

/**
 * A Platform Admin publishes, archives or moves a course to Draft from the
 * admin courses page. The course's owner is told, unless the Platform Admin
 * owns it or the status didn't actually change. (An Instructor changing their
 * own course's status in the course editor doesn't come through here.)
 */
export function changeCourseStatus(
  db: Db,
  platformAdminId: number,
  courseId: number,
  status: CourseStatus,
  now: Date
): CourseChangeResult {
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) {
    return { ok: false, status: 404, error: "Course not found." };
  }

  if (course.status === status) {
    return { ok: true, notifications: [] };
  }

  db.update(courses)
    .set({ status, updatedAt: now.toISOString() })
    .where(eq(courses.id, courseId))
    .run();

  const owner = getUser(db, course.instructorId);
  if (!owner) return { ok: true, notifications: [] };

  return {
    ok: true,
    notifications: notify(
      "course-status-changed",
      [owner],
      getUser(db, platformAdminId) ?? null,
      {
        courseTitle: course.title,
        newStatus: status,
        url: `/instructor/${course.id}`,
      }
    ),
  };
}
