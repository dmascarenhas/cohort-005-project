import { CourseStatus, UserRole } from "~/db/schema";
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
  | "enrollment"
  // ── Refund decisions (#12) ──
  | "refund"
  // ── Course rated and Course status changed (#16) ──
  | "rating"
  | "course-status"
  // ── Discussions (#14) ──
  | "question"
  | "reply";

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

/** "A Platform Admin {published / archived / moved} {Course}[ to Draft]." */
const STATUS_CHANGE_VERB: Record<CourseStatus, string> = {
  [CourseStatus.Published]: "published",
  [CourseStatus.Archived]: "archived",
  [CourseStatus.Draft]: "moved",
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
  // ── Refund decisions (#12) ──
  "refund-request-approved": ({ courseTitle, amount }) => ({
    icon: "refund",
    parts: [
      "Your Refund Request for ",
      { strong: courseTitle },
      ` was approved. ${amount} is on its way back to you.`,
    ],
  }),
  "refund-request-declined": ({ courseTitle, note }) => ({
    icon: "refund",
    parts: [
      "Your Refund Request for ",
      { strong: courseTitle },
      ` was declined: "${note}". You can raise a new one.`,
    ],
  }),
  "team-licence-refund-request-approved": ({
    courseTitle,
    amount,
    cancelledSeats,
  }) => ({
    icon: "refund",
    parts: [
      "Your Refund Request for the ",
      { strong: courseTitle },
      ` Team Licence was approved. ${amount} is on its way back to you, and its ${unclaimedSeats(cancelledSeats)} can no longer be claimed.`,
    ],
  }),
  "team-licence-refund-request-declined": ({ courseTitle, note }) => ({
    icon: "refund",
    parts: [
      "Your Refund Request for the ",
      { strong: courseTitle },
      ` Team Licence was declined: "${note}". Its Unclaimed Seats can be claimed again.`,
    ],
  }),
  "enrollment-refunded": (data) => ({
    icon: "refund",
    parts: [
      "A Refund Request for ",
      { strong: data.courseTitle },
      " was approved. ",
      ...(data.purchaseType === "individual"
        ? [{ strong: data.studentName }, " no longer has an Enrollment."]
        : [
            `${unclaimedSeats(data.cancelledSeats)} ${data.cancelledSeats === 1 ? "was" : "were"} cancelled.`,
          ]),
    ],
  }),
  // ── end refund decisions ──
  "course-rated": ({ actorName, courseTitle, rating }) => ({
    icon: "rating",
    parts: [
      { strong: actorName },
      " rated ",
      { strong: courseTitle },
      ` ${rating}/5.`,
    ],
  }),
  "course-status-changed": ({ courseTitle, newStatus }) => ({
    icon: "course-status",
    parts: [
      `A Platform Admin ${STATUS_CHANGE_VERB[newStatus]} `,
      { strong: courseTitle },
      newStatus === CourseStatus.Draft ? " to Draft." : ".",
    ],
  }),
  // Discussions (#14)
  "new-discussion-question": ({ actorName, lessonTitle, courseTitle }) => ({
    icon: "question",
    parts: [
      { strong: actorName },
      " asked a question on ",
      { strong: lessonTitle },
      " in ",
      { strong: courseTitle },
      ".",
    ],
  }),
  "instructor-answered-discussion-question": ({
    actorName,
    lessonTitle,
    courseTitle,
  }) => ({
    icon: "reply",
    parts: [
      { strong: actorName },
      " answered your question on ",
      { strong: lessonTitle },
      " in ",
      { strong: courseTitle },
      ".",
    ],
  }),
  "new-discussion-reply": ({ actorName, lessonTitle }) => ({
    icon: "reply",
    parts: [
      { strong: actorName },
      " replied to your question on ",
      { strong: lessonTitle },
      ".",
    ],
  }),
};

function unclaimedSeats(count: number): string {
  return `${count} Unclaimed ${count === 1 ? "Seat" : "Seats"}`;
}

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
  return describeAs(workflowKey, data);
}

// The schemas seen as one parser per key. Assigning the real schemas here is
// checked key by key, and indexing a mapped type with a generic key lets
// TypeScript tie that key's parsed data to that key's describer.
const parsers: {
  [K in WorkflowKey]: {
    safeParse(
      data: unknown
    ): { success: true; data: NotificationData<K> } | { success: false };
  };
} = notificationDataSchemas;

function describeAs<K extends WorkflowKey>(
  workflowKey: K,
  data: unknown
): DescribedNotification | null {
  const parsed = parsers[workflowKey].safeParse(data);
  if (!parsed.success) return null;

  const describe: (data: NotificationData<K>) => Omit<
    DescribedNotification,
    "url"
  > = describers[workflowKey];
  return { ...describe(parsed.data), url: parsed.data.url };
}

/** The sentence as plain text, for labels and Knock's fallback template. */
export function sentenceText(parts: SentencePart[]): string {
  return parts
    .map((part) => (typeof part === "string" ? part : part.strong))
    .join("");
}
