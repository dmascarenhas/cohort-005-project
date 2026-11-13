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

export type NotificationIcon = "role" | "question" | "reply";

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
  return describeKnown(workflowKey, data);
}

// The schemas seen only as parsers, as a mapped type over the workflow keys,
// so indexing with a generic key keeps the key and its data type together.
const parsers: {
  [K in WorkflowKey]: {
    safeParse(
      data: unknown
    ): { success: true; data: NotificationData<K> } | { success: false };
  };
} = notificationDataSchemas;

// Generic over the key, so the parsed data and its describer stay tied to the
// same workflow instead of widening to a union of all of them.
function describeKnown<K extends WorkflowKey>(
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
