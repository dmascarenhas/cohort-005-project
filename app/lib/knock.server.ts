import Knock, { signUserToken } from "@knocklabs/node";
import type { Notification, NotificationPerson } from "~/lib/notifications";

// ─── Knock ───
// Knock delivers Notifications (docs/adr/0013). Enhanced security is on in
// every environment, so the browser's Notification Feed only connects with a
// user token signed here (docs/adr/0014). The Knock user id is the Cadence
// user id as a string.

/** What the browser needs to open one person's Notification Feed. */
export type FeedConnection = {
  publicKey: string;
  feedChannelId: string;
  userToken: string;
};

export function knockUserId(userId: number): string {
  return String(userId);
}

/**
 * A user token for this person's Notification Feed, valid for an hour. Null
 * when no signing key is configured.
 */
export async function signFeedToken(userId: number): Promise<string | null> {
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  if (!signingKey) return null;

  // The key is kept base64-encoded in .env; the SDK accepts that as is.
  return signUserToken(knockUserId(userId), { signingKey });
}

/**
 * Everything the bell needs to connect as this person, or null when Knock
 * isn't configured or the token can't be signed. A broken Feed must never
 * take the rest of the page down with it.
 */
export async function connectFeed(
  userId: number
): Promise<FeedConnection | null> {
  const publicKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!publicKey || !feedChannelId) return null;

  try {
    const userToken = await signFeedToken(userId);
    if (!userToken) return null;
    return { publicKey, feedChannelId, userToken };
  } catch (error) {
    console.error("Could not sign a Knock user token", { userId, error });
    return null;
  }
}

// ─── Sending Notifications ───

/** The one Knock call Cadence makes to send a Notification. */
export type KnockTrigger = {
  trigger(
    workflow: string,
    body: {
      recipients: NotificationPerson[];
      actor?: NotificationPerson;
      data: Record<string, unknown>;
    }
  ): Promise<unknown>;
};

export type SendOptions = {
  /** Who sends to Knock. Null means Knock isn't configured: send nothing. */
  knock?: KnockTrigger | null;
  /**
   * In Development, every email goes here instead. Knock's test email channel
   * only delivers to members of the Knock account, and the seed users'
   * addresses aren't real. Never set it in Production.
   */
  devEmailRedirect?: string | null;
};

function defaultKnock(): KnockTrigger | null {
  // Passed explicitly: the SDK would otherwise read KNOCK_API_KEY.
  const apiKey = process.env.KNOCK_SECRET_API_KEY;
  if (!apiKey) return null;

  const client = new Knock({ apiKey });
  return {
    trigger: (workflow, body) => client.workflows.trigger(workflow, body),
  };
}

function redirectEmail(
  person: NotificationPerson,
  devEmailRedirect: string | null
): NotificationPerson {
  return devEmailRedirect ? { ...person, email: devEmailRedirect } : person;
}

/**
 * Sends each Notification through its Knock workflow. Call it after the
 * database write has committed, so nobody hears about something that was
 * rolled back. A failure is logged and never thrown: a Knock outage must not
 * stop someone deciding a Refund Request or changing a role.
 */
export async function sendNotifications(
  notifications: Notification[],
  {
    knock = defaultKnock(),
    devEmailRedirect = process.env.KNOCK_DEV_EMAIL_REDIRECT || null,
  }: SendOptions = {}
): Promise<void> {
  if (!knock) return;

  for (const notification of notifications) {
    const recipients = notification.recipients.map((person) =>
      redirectEmail(person, devEmailRedirect)
    );
    const actor = notification.actor
      ? redirectEmail(notification.actor, devEmailRedirect)
      : undefined;

    try {
      await knock.trigger(notification.workflow, {
        recipients,
        ...(actor ? { actor } : {}),
        data: notification.data,
      });
    } catch (error) {
      console.error("Could not send a Notification through Knock", {
        workflow: notification.workflow,
        recipientIds: recipients.map((person) => person.id),
        error,
      });
    }
  }
}

// ─── Clearing Development users ───

/** The two Knock calls the seed needs to empty an environment's users. */
export type KnockUserAdmin = {
  listUserIds(): AsyncIterable<string>;
  bulkDelete(userIds: string[]): Promise<unknown>;
};

export type ClearKnockUsersResult =
  | { status: "skipped"; reason: string }
  | { status: "cleared"; count: number }
  | { status: "failed"; error: unknown };

/** Knock deletes at most this many users in one bulk call. */
const BULK_DELETE_LIMIT = 1000;

function knockUserAdmin(apiKey: string): KnockUserAdmin {
  const client = new Knock({ apiKey });
  return {
    async *listUserIds() {
      for await (const user of client.users.list()) yield user.id;
    },
    bulkDelete: (userIds) => client.users.bulk.delete({ user_ids: userIds }),
  };
}

/**
 * Deletes every Knock user in the Development environment, so that after a
 * reseed renumbers users (docs/adr/0014) no seed user opens a Feed full of
 * someone else's Notifications. Runs only with a test secret key: a live key
 * belongs to Production and is never touched. Never throws, so a Knock
 * problem can't stop the seed.
 */
export async function clearKnockDevelopmentUsers({
  apiKey = process.env.KNOCK_SECRET_API_KEY,
  admin,
}: { apiKey?: string; admin?: KnockUserAdmin } = {}): Promise<ClearKnockUsersResult> {
  if (!apiKey) {
    return { status: "skipped", reason: "KNOCK_SECRET_API_KEY isn't set" };
  }
  if (!apiKey.startsWith("sk_test_")) {
    return {
      status: "skipped",
      reason: "KNOCK_SECRET_API_KEY isn't a test key, so it isn't Development",
    };
  }

  const knock = admin ?? knockUserAdmin(apiKey);

  try {
    // List everyone before deleting anyone: deleting while paging through
    // the list could move the cursor past users not yet seen.
    const userIds: string[] = [];
    for await (const userId of knock.listUserIds()) userIds.push(userId);

    for (let start = 0; start < userIds.length; start += BULK_DELETE_LIMIT) {
      await knock.bulkDelete(userIds.slice(start, start + BULK_DELETE_LIMIT));
    }

    return { status: "cleared", count: userIds.length };
  } catch (error) {
    return { status: "failed", error };
  }
}
