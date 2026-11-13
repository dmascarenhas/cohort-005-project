import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { createComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let student: typeof schema.users.$inferSelect;
let otherStudent: typeof schema.users.$inferSelect;
let platformAdmin: typeof schema.users.$inferSelect;

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.split(" ")[0]?.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Generics", position: 1 })
    .returning()
    .get().id;
  student = addUser("Emma Wilson", UserRole.Student);
  otherStudent = addUser("James Park", UserRole.Student);
  platformAdmin = addUser("Alex Rivera", UserRole.Admin);
});

function ask(userId = student.id) {
  return createComment(db, userId, lessonId, null, "How do generics work?");
}

const person = (user: { id: number; name: string; email: string }) => ({
  id: String(user.id),
  name: user.name,
  email: user.email,
  avatar: null,
});

describe("createComment: Discussion Questions", () => {
  it("tells the course's owner about a Discussion Question", () => {
    const { comment, notifications } = ask();

    expect(comment.parentId).toBeNull();
    expect(notifications).toEqual([
      {
        workflow: "new-discussion-question",
        recipients: [person(base.instructor)],
        actor: person(student),
        data: {
          actorName: "Emma Wilson",
          lessonTitle: "Generics",
          courseTitle: "Test Course",
          url: "/instructor/questions",
        },
      },
    ]);
  });

  it("treats a Platform Admin's top-level comment as a Discussion Question too", () => {
    const { notifications } = ask(platformAdmin.id);

    expect(notifications.map((n) => n.workflow)).toEqual([
      "new-discussion-question",
    ]);
  });

  it("doesn't notify anyone about the owner's own top-level comment", () => {
    expect(ask(base.instructor.id).notifications).toEqual([]);
  });
});

describe("createComment: Discussion Replies", () => {
  it("tells the asker when the course's owner answers", () => {
    const question = ask().comment;

    const { comment, notifications } = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Like this."
    );

    expect(comment.parentId).toBe(question.id);
    expect(notifications).toEqual([
      {
        workflow: "instructor-answered-discussion-question",
        recipients: [person(student)],
        actor: person(base.instructor),
        data: {
          actorName: "Test Instructor",
          lessonTitle: "Generics",
          courseTitle: "Test Course",
          url: `/courses/test-course/lessons/${lessonId}#discussion-${question.id}`,
        },
      },
    ]);
  });

  it("tells the asker about a reply from anyone else", () => {
    const question = ask().comment;

    const { notifications } = createComment(
      db,
      otherStudent.id,
      lessonId,
      question.id,
      "Same question here."
    );

    expect(notifications).toEqual([
      {
        workflow: "new-discussion-reply",
        recipients: [person(student)],
        actor: person(otherStudent),
        data: {
          actorName: "James Park",
          lessonTitle: "Generics",
          url: `/courses/test-course/lessons/${lessonId}#discussion-${question.id}`,
        },
      },
    ]);
  });

  it("doesn't notify someone replying to their own Discussion Question", () => {
    const question = ask().comment;

    const { notifications } = createComment(
      db,
      student.id,
      lessonId,
      question.id,
      "Never mind, solved it."
    );

    expect(notifications).toEqual([]);
  });

  it("doesn't notify on replies to the owner's own top-level comment", () => {
    const announcement = ask(base.instructor.id).comment;

    const { notifications } = createComment(
      db,
      student.id,
      lessonId,
      announcement.id,
      "Thanks!"
    );

    expect(notifications).toEqual([]);
  });

  it("refuses a reply to a reply", () => {
    const question = ask().comment;
    const reply = createComment(
      db,
      otherStudent.id,
      lessonId,
      question.id,
      "Same."
    ).comment;

    expect(() =>
      createComment(db, student.id, lessonId, reply.id, "Nested")
    ).toThrow("Replies can only be one level deep");
  });

  it("refuses an empty comment", () => {
    expect(() => createComment(db, student.id, lessonId, null, "   ")).toThrow(
      "Comment cannot be empty"
    );
  });
});
