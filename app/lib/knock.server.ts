import { signUserToken } from "@knocklabs/node";

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
