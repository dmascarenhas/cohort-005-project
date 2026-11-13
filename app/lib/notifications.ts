import { z } from "zod";
import { CourseStatus, UserRole } from "~/db/schema";

// ─── Notifications ───
// What Cadence sends Knock, shared by the server (which triggers Notifications)
// and the browser (whose Notification Feed renders them). There is one Knock
// workflow per kind of Notification, and its key is the kind. Each workflow's
// `data` carries the display values as they were when it was sent, plus a
// relative `url` to open on click. See "What does each Notification's trigger
// send to Knock?" for the contract.

export const notificationDataSchemas = {
  "role-changed": z.object({
    newRole: z.nativeEnum(UserRole),
    url: z.string(),
  }),
  "course-rated": z.object({
    actorName: z.string(),
    courseTitle: z.string(),
    rating: z.number().int(),
    url: z.string(),
  }),
  "course-status-changed": z.object({
    courseTitle: z.string(),
    newStatus: z.nativeEnum(CourseStatus),
    url: z.string(),
  }),
} satisfies Record<string, z.ZodType<{ url: string }>>;

export type WorkflowKey = keyof typeof notificationDataSchemas;

export type NotificationData<K extends WorkflowKey> = z.infer<
  (typeof notificationDataSchemas)[K]
>;

/** A person, identified inline on the trigger (docs/adr/0014). */
export type NotificationPerson = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
};

/** One Notification: a workflow, who gets it, who caused it, and its data. */
export type Notification = {
  [K in WorkflowKey]: {
    workflow: K;
    recipients: NotificationPerson[];
    actor: NotificationPerson | null;
    data: NotificationData<K>;
  };
}[WorkflowKey];

type PersonRow = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function toNotificationPerson(user: PersonRow): NotificationPerson {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl,
  };
}

/**
 * The Notifications an event produces for these people. The person who acted
 * is never a recipient: the on-screen confirmation is enough. If nobody else
 * is left, there is nothing to send.
 */
export function notify<K extends WorkflowKey>(
  workflow: K,
  recipients: PersonRow[],
  actor: PersonRow | null,
  data: NotificationData<K>
): Notification[] {
  const others = recipients.filter((person) => person.id !== actor?.id);
  if (others.length === 0) return [];

  // The mapped union can't be narrowed from a generic K, so build it for the
  // one workflow K is and let the union check it.
  const notification = {
    workflow,
    recipients: others.map(toNotificationPerson),
    actor: actor ? toNotificationPerson(actor) : null,
    data,
  } as Notification;

  return [notification];
}
