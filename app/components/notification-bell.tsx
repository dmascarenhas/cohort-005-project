import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { Bell, Receipt, UserCog } from "lucide-react";
import { z } from "zod";
import {
  KnockFeedProvider,
  KnockProvider,
  useKnockFeed,
  useNotificationStore,
} from "@knocklabs/react-core";
import type { FeedConnection } from "~/lib/knock.server";
import {
  describeNotification,
  type DescribedNotification,
  type NotificationIcon,
} from "~/lib/notification-sentences";
import { cn, formatRelativeTime } from "~/lib/utils";

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

type NotificationBellProps = {
  userId: number;
  connection: FeedConnection;
};

// Keyed on the user: a DevUI switch re-runs the layout loader, and the new
// user gets a new token and a freshly mounted Knock client.
export function NotificationBell(props: NotificationBellProps) {
  return <UserFeed key={props.userId} {...props} />;
}

function UserFeed({ userId, connection }: NotificationBellProps) {
  // The layout loader re-runs on every navigation and signs a new token each
  // time. Handing those to Knock would re-authenticate and reconnect on every
  // page change, so keep the first token for this user; Knock asks for a fresh
  // one through onUserTokenExpiring when it is about to run out.
  const [userToken] = useState(connection.userToken);

  const revalidator = useRevalidator();
  const revalidateRef = useRef(revalidator.revalidate);
  revalidateRef.current = revalidator.revalidate;

  // Knock compares its props by reference, so a new user object or callback on
  // every render would rebuild the client and its socket each time.
  const user = useMemo(() => ({ id: String(userId) }), [userId]);
  const onUserTokenExpiring = useCallback(
    () => refreshToken(userId, () => revalidateRef.current()),
    [userId]
  );

  // The Knock client is built during render, so on the server it would
  // identify the user and start timers. Mount it only once the page has
  // hydrated; until then show the same bell without a count. (Mounting it
  // disabled and enabling it later skips the real-time connection, because the
  // feed only joins the socket if it was created signed in.)
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!hydrated) return <BellButton unread={0} open={false} />;

  return (
    <KnockProvider
      apiKey={connection.publicKey}
      user={user}
      userToken={userToken}
      onUserTokenExpiring={onUserTokenExpiring}
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
  const navigate = useNavigate();

  // Items Cadence can't describe (an unknown workflow, or data that breaks
  // its contract) are left out rather than shown as blank rows.
  const rows = items.flatMap((item) => {
    const described = describeNotification(item.source.key, item.data);
    return described ? [{ item, described }] : [];
  });

  useEffect(() => {
    void feedClient.fetch();
  }, [feedClient]);

  return (
    <div className="relative">
      <BellButton
        unread={unread}
        open={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      />
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-10 z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void feedClient.markAllAsRead()}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {rows.length === 0 && <EmptyFeed />}
              {rows.map(({ item, described }) => (
                <FeedRow
                  key={item.id}
                  described={described}
                  insertedAt={item.inserted_at}
                  unread={item.read_at === null}
                  onOpen={() => {
                    void feedClient.markAsRead(item);
                    setOpen(false);
                    navigate(described.url);
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellButton({
  unread,
  open,
  onClick,
}: {
  unread: number;
  open: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
  );
}

const ICONS: Record<NotificationIcon, React.ReactNode> = {
  role: <UserCog className="size-4" />,
  refund: <Receipt className="size-4" />,
};

function FeedRow({
  described,
  insertedAt,
  unread,
  onOpen,
}: {
  described: DescribedNotification;
  insertedAt: string;
  unread: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-accent",
        unread && "bg-primary/5"
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {ICONS[described.icon]}
      </span>
      <span className="flex-1 text-muted-foreground">
        {described.parts.map((part, index) =>
          typeof part === "string" ? (
            <span key={index}>{part}</span>
          ) : (
            <strong key={index} className="font-semibold text-foreground">
              {part.strong}
            </strong>
          )
        )}
        <span className="mt-1 block text-xs text-muted-foreground/70">
          {formatRelativeTime(insertedAt)}
        </span>
      </span>
      {unread && (
        <span
          className="mt-2 size-2 shrink-0 rounded-full bg-primary"
          aria-label="Unread"
        />
      )}
    </button>
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
