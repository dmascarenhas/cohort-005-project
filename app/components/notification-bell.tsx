import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { Bell } from "lucide-react";
import { z } from "zod";
import {
  KnockFeedProvider,
  KnockProvider,
  useKnockFeed,
  useNotificationStore,
} from "@knocklabs/react-core";
import type { FeedConnection } from "~/lib/knock.server";

// ─── Notification Feed ───
// A bell in the sidebar header that opens the person's Notification Feed as a
// dropdown. The Feed is built from Knock's headless hooks so it matches
// Cadence's own components. See "What does the Notification Feed look like?"
// (variant A) for the design.

const tokenResponseSchema = z.object({
  userId: z.number(),
  token: z.string(),
});

/**
 * A fresh token for the user this Feed belongs to. If the session has moved
 * on to someone else (a DevUI switch in another tab), re-run the loaders so
 * the whole page, Feed included, follows the new user.
 */
async function refreshToken(
  userId: number,
  revalidate: () => Promise<void>
): Promise<string | void> {
  const response = await fetch("/api/knock-token");

  if (!response.ok) {
    await revalidate();
    return;
  }

  const body = tokenResponseSchema.parse(await response.json());

  if (body.userId !== userId) {
    await revalidate();
    return;
  }

  return body.token;
}

export function NotificationBell({
  userId,
  connection,
}: {
  userId: number;
  connection: FeedConnection;
}) {
  const revalidator = useRevalidator();

  // Keyed on the user: a DevUI switch re-runs the layout loader, and the new
  // user gets a new token and a freshly mounted Knock client.
  return (
    <KnockProvider
      key={userId}
      apiKey={connection.publicKey}
      user={{ id: String(userId) }}
      userToken={connection.userToken}
      onUserTokenExpiring={() => refreshToken(userId, revalidator.revalidate)}
    >
      <KnockFeedProvider feedId={connection.feedChannelId}>
        <BellDropdown />
      </KnockFeedProvider>
    </KnockProvider>
  );
}

function BellDropdown() {
  const { feedClient } = useKnockFeed();
  const { items, metadata } = useNotificationStore(feedClient);
  const [open, setOpen] = useState(false);
  const unread = metadata.unread_count;

  useEffect(() => {
    void feedClient.fetch();
  }, [feedClient]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        title="Notifications"
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-10 z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {/* Rows come with the first kind of Notification Cadence sends. */}
              {items.length === 0 && <EmptyFeed />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
      <Bell className="size-6 opacity-40" />
      You're all caught up.
    </div>
  );
}
