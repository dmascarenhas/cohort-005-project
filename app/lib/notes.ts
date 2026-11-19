import { z } from "zod";

export const MAX_NOTE_LENGTH = 2000;

/**
 * The one rule for a Note body: trimmed plain text, capped. An empty body is
 * allowed; saving one clears the Note.
 */
export const noteBodySchema = z
  .string()
  .trim()
  .max(
    MAX_NOTE_LENGTH,
    `Your note is over ${MAX_NOTE_LENGTH.toLocaleString("en")} characters, so it was not saved.`
  );
