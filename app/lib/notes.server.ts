import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { courses, lessons, modules, notes } from "~/db/schema";
import { savedLessonColumns } from "~/lib/saved-lesson.server";
import { noteBodySchema } from "~/lib/notes";

// ─── Notes ───
// A Student's own writing about a Lesson, private to the Student who wrote it.
// One per Student per Lesson, enforced by a unique index. A Note body is plain
// text and is never rendered as Markdown. See GLOSSARY.md for the language.
//
// Nothing outside the owning Student's Lesson page and Saved page may read a
// Note body: no Instructor or Platform Admin view.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

type Note = typeof notes.$inferSelect;

/** The Student's Note on the Lesson, if they have written one. */
export function getNote(
  db: Db,
  studentId: number,
  lessonId: number
): Note | undefined {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, studentId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult = { ok: true } | { ok: false; error: string };

/**
 * Writes the Student's Note on the Lesson. Saving again replaces the body and
 * moves `updatedAt` on; `createdAt` stays where it was. Saving an empty body
 * (after trimming) clears the Note by deleting it. The body is checked
 * against `noteBodySchema`, so a Note over the cap is refused, not truncated.
 */
export function saveNote(
  db: Db,
  studentId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const parsed = noteBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };
  }
  const trimmed = parsed.data;

  if (trimmed.length === 0) {
    db.delete(notes)
      .where(and(eq(notes.userId, studentId), eq(notes.lessonId, lessonId)))
      .run();
    return { ok: true };
  }

  const at = now.toISOString();
  db
    .insert(notes)
    .values({
      userId: studentId,
      lessonId,
      body: trimmed,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: trimmed, updatedAt: at },
    })
    .run();

  return { ok: true };
}

/** The Student's Notes, most recently edited first, each with its Lesson and Course. */
export function listNotes(db: Db, studentId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      lesson: savedLessonColumns,
    })
    .from(notes)
    .innerJoin(lessons, eq(lessons.id, notes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(notes.userId, studentId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}
