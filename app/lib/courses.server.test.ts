import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { changeCourseStatus, rateCourse } from "./courses.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 10, 13, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  platformAdmin = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();
});

function ratingOf(userId: number) {
  return db
    .select({ rating: schema.courseRatings.rating })
    .from(schema.courseRatings)
    .where(
      and(
        eq(schema.courseRatings.userId, userId),
        eq(schema.courseRatings.courseId, base.course.id)
      )
    )
    .get()?.rating;
}

function statusOf(courseId: number) {
  return db
    .select({ status: schema.courses.status })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get()?.status;
}

describe("rateCourse", () => {
  it("tells the course's owner about a Student's first rating", () => {
    const result = rateCourse(db, base.user.id, base.course.id, 4, NOW);

    expect(ratingOf(base.user.id)).toBe(4);
    expect(result).toEqual({
      ok: true,
      notifications: [
        {
          workflow: "course-rated",
          recipients: [
            {
              id: String(base.instructor.id),
              name: "Test Instructor",
              email: "instructor@example.com",
              avatar: null,
            },
          ],
          actor: {
            id: String(base.user.id),
            name: "Test User",
            email: "test@example.com",
            avatar: null,
          },
          data: {
            actorName: "Test User",
            courseTitle: "Test Course",
            rating: 4,
            url: `/instructor/${base.course.id}`,
          },
        },
      ],
    });
  });

  it("updates a re-rate without notifying", () => {
    rateCourse(db, base.user.id, base.course.id, 4, NOW);

    const result = rateCourse(db, base.user.id, base.course.id, 2, NOW);

    expect(ratingOf(base.user.id)).toBe(2);
    expect(result).toEqual({ ok: true, notifications: [] });
  });

  it("doesn't notify an owner who rates their own course", () => {
    const result = rateCourse(db, base.instructor.id, base.course.id, 5, NOW);

    expect(result).toEqual({ ok: true, notifications: [] });
  });

  it("refuses a rating outside 1 to 5, and records nothing", () => {
    const result = rateCourse(db, base.user.id, base.course.id, 6, NOW);

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(ratingOf(base.user.id)).toBeUndefined();
  });

  it("refuses a course that doesn't exist", () => {
    expect(rateCourse(db, base.user.id, 9999, 3, NOW)).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe("changeCourseStatus", () => {
  it.each([
    CourseStatus.Archived,
    CourseStatus.Draft,
  ])("tells the course's owner when a Platform Admin makes it %s", (status) => {
    const result = changeCourseStatus(
      db,
      platformAdmin.id,
      base.course.id,
      status,
      NOW
    );

    expect(statusOf(base.course.id)).toBe(status);
    expect(result).toEqual({
      ok: true,
      notifications: [
        {
          workflow: "course-status-changed",
          recipients: [
            {
              id: String(base.instructor.id),
              name: "Test Instructor",
              email: "instructor@example.com",
              avatar: null,
            },
          ],
          actor: {
            id: String(platformAdmin.id),
            name: "Pat Admin",
            email: "pat@example.com",
            avatar: null,
          },
          data: {
            courseTitle: "Test Course",
            newStatus: status,
            url: `/instructor/${base.course.id}`,
          },
        },
      ],
    });
  });

  it("doesn't notify when the status is unchanged", () => {
    const result = changeCourseStatus(
      db,
      platformAdmin.id,
      base.course.id,
      CourseStatus.Published,
      NOW
    );

    expect(result).toEqual({ ok: true, notifications: [] });
  });

  it("doesn't notify a Platform Admin who changes their own course", () => {
    db.update(schema.courses)
      .set({ instructorId: platformAdmin.id })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    const result = changeCourseStatus(
      db,
      platformAdmin.id,
      base.course.id,
      CourseStatus.Archived,
      NOW
    );

    expect(statusOf(base.course.id)).toBe(CourseStatus.Archived);
    expect(result).toEqual({ ok: true, notifications: [] });
  });

  it("refuses a course that doesn't exist", () => {
    expect(
      changeCourseStatus(db, platformAdmin.id, 9999, CourseStatus.Draft, NOW)
    ).toMatchObject({ ok: false, status: 404 });
  });
});
