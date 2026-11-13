import { eq } from "drizzle-orm";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import { notify, type Notification } from "~/lib/notifications";
import type { Db } from "~/lib/refunds.server";

// ─── Discussions ───
// Posting a comment on a lesson, from the lesson page or the Unanswered
// Questions queue, and the Notifications it produces. See GLOSSARY.md: a
// Discussion Question is a top-level comment by anyone other than the course's
// Instructor, and Discussion Replies are one level deep.
//
// Takes the database first, so tests can hand in an in-memory one.

type Comment = typeof comments.$inferSelect;

export type CreatedComment = {
  comment: Comment;
  notifications: Notification[];
};

function assertValidBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

function getLessonWithCourse(db: Db, lessonId: number) {
  return db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      ownerId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

function getUser(db: Db, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

/**
 * Posts a comment on a lesson, top-level or as a Discussion Reply, and returns
 * the Notifications it produces:
 *
 * - A Discussion Question (a top-level comment by anyone other than the
 *   course's owner) tells the owner.
 * - A Discussion Reply tells the person who asked: "Instructor answered" when
 *   the course's owner replied, "New Discussion Reply" when anyone else did.
 *   Replies to the owner's own top-level comments, which aren't Discussion
 *   Questions, notify nobody.
 *
 * Nobody is told about their own comment. Throws an Error with a message the
 * poster can act on when the comment can't be posted.
 */
export function createComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
): CreatedComment {
  const trimmed = assertValidBody(body);

  const lesson = getLessonWithCourse(db, lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  const parent =
    parentId === null
      ? null
      : db.select().from(comments).where(eq(comments.id, parentId)).get();

  if (parentId !== null) {
    if (!parent) {
      throw new Error("Parent comment not found");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (parent.parentId !== null) {
      throw new Error("Replies can only be one level deep");
    }
  }

  const comment = db
    .insert(comments)
    .values({ userId, lessonId, parentId, body: trimmed })
    .returning()
    .get();

  const author = getUser(db, userId);
  if (!author) return { comment, notifications: [] };

  return {
    comment,
    notifications: parent
      ? replyNotifications(db, lesson, author, parent)
      : questionNotifications(db, lesson, author),
  };
}

type Lesson = NonNullable<ReturnType<typeof getLessonWithCourse>>;
type User = typeof users.$inferSelect;

function threadUrl(lesson: Lesson, questionId: number) {
  return `/courses/${lesson.courseSlug}/lessons/${lesson.lessonId}#discussion-${questionId}`;
}

function questionNotifications(
  db: Db,
  lesson: Lesson,
  author: User
): Notification[] {
  // The owner's own top-level comment isn't a Discussion Question.
  if (author.id === lesson.ownerId) return [];

  const owner = getUser(db, lesson.ownerId);
  if (!owner) return [];

  return notify("new-discussion-question", [owner], author, {
    actorName: author.name,
    lessonTitle: lesson.lessonTitle,
    courseTitle: lesson.courseTitle,
    url: "/instructor/questions",
  });
}

function replyNotifications(
  db: Db,
  lesson: Lesson,
  author: User,
  question: Comment
): Notification[] {
  // Only a Discussion Question's asker hears about replies: not the owner
  // replying on their own top-level comment, and not a deleted question.
  if (question.userId === lesson.ownerId || question.deletedAt !== null) {
    return [];
  }

  const asker = getUser(db, question.userId);
  if (!asker) return [];

  const url = threadUrl(lesson, question.id);

  if (author.id === lesson.ownerId) {
    return notify("instructor-answered-discussion-question", [asker], author, {
      actorName: author.name,
      lessonTitle: lesson.lessonTitle,
      courseTitle: lesson.courseTitle,
      url,
    });
  }

  return notify("new-discussion-reply", [asker], author, {
    actorName: author.name,
    lessonTitle: lesson.lessonTitle,
    url,
  });
}
