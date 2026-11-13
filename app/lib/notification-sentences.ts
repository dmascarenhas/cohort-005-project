import { UserRole } from "~/db/schema";
import {
  notificationDataSchemas,
  type NotificationData,
  type WorkflowKey,
} from "~/lib/notifications";

// ─── How a Notification reads in the Feed ───
// One plain sentence from the recipient's point of view, with the names to
// show in bold, built from the data captured when it was sent. The wording
// lives here rather than in Knock's template, so the Feed never renders HTML
// from Knock (see "Can Knock's prebuilt feed match the bell dropdown?").

/** Text runs of a sentence; `{ strong }` runs are shown in bold. */
export type SentencePart = string | { strong: string };

export type NotificationIcon =
  | "role"
  // ── Seat claimed and New Enrollment (#15) ──
  | "seat"
  | "enrollment";

export type DescribedNotification = {
  icon: NotificationIcon;
  parts: SentencePart[];
  url: string;
};

const ROLE_WITH_ARTICLE: Record<UserRole, string> = {
  [UserRole.Student]: "a Student",
  [UserRole.Instructor]: "an Instructor",
  [UserRole.Admin]: "a Platform Admin",
};

const describers: {
  [K in WorkflowKey]: (
    data: NotificationData<K>
  ) => Omit<DescribedNotification, "url">;
} = {
  "role-changed": ({ newRole }) => ({
    icon: "role",
    parts: ["A Platform Admin made you ", { strong: ROLE_WITH_ARTICLE[newRole] }, "."],
  }),
  // ── Seat claimed and New Enrollment (#15) ──
  "seat-claimed": ({ actorName, courseTitle, unclaimedSeats, totalSeats }) => ({
    icon: "seat",
    parts: [
      { strong: actorName },
      " claimed a Seat on your Team Licence for ",
      { strong: courseTitle },
      `. ${unclaimedSeats} of ${totalSeats} Seats are still unclaimed.`,
    ],
  }),
  "new-enrollment": ({ actorName, courseTitle }) => ({
    icon: "enrollment",
    parts: [{ strong: actorName }, " enrolled on ", { strong: courseTitle }, "."],
  }),
};

function isWorkflowKey(key: string): key is WorkflowKey {
  return Object.hasOwn(notificationDataSchemas, key);
}

/**
 * What a Feed item says, from its workflow key and data. Null for a workflow
 * Cadence doesn't know or data that doesn't match its contract, so a bad or
 * future message is skipped rather than breaking the Feed.
 */
export function describeNotification(
  workflowKey: string,
  data: unknown
): DescribedNotification | null {
  if (!isWorkflowKey(workflowKey)) return null;

  const parsed = notificationDataSchemas[workflowKey].safeParse(data);
  if (!parsed.success) return null;

  // TypeScript can't pair describers[key] with schemas[key] through a union
  // key, but parsed.data was just checked against this key's own schema.
  const describe = describers[workflowKey] as (
    data: NotificationData<WorkflowKey>
  ) => Omit<DescribedNotification, "url">;

  return { ...describe(parsed.data), url: parsed.data.url };
}

/** The sentence as plain text, for labels and Knock's fallback template. */
export function sentenceText(parts: SentencePart[]): string {
  return parts
    .map((part) => (typeof part === "string" ? part : part.strong))
    .join("");
}
