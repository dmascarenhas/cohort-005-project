// PROTOTYPE — throwaway. Lives on the `prototype/notification-feed` branch only.
// Question: what does the Notification Feed look like in Cadence?
// Three variants, switchable via `?variant=A|B|C` and the floating bottom bar:
//   A  Bell + dropdown in the sidebar header (no page)
//   B  "Notifications" nav item with a count badge + a full inbox page
//   C  Bell in the user footer opens a slide-over drawer, "View all" goes to the full page (both)
// Notifications are mocked from the catalogue in "Which Notifications does each role get?" (#4).
// State is in memory only; no vendor, no database writes.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router";
import {
  Bell,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Inbox,
  MessageSquare,
  Receipt,
  Star,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";

// ─── Mock data ────────────────────────────────────────────────────────────

export interface FeedPrototypeData {
  course: { id: number; title: string; slug: string } | null;
  lesson: { id: number; title: string } | null;
  people: string[];
}

type Audience = "Student" | "Team Admin" | "Instructor" | "Platform Admin" | "You";

interface MockNotification {
  id: string;
  kind: string;
  audience: Audience;
  icon: ReactNode;
  // The sentence, with the bold parts pre-split so variants can style them.
  parts: Array<string | { strong: string }>;
  to: string;
  minutesAgo: number;
  read: boolean;
  email: boolean;
  needsYou: boolean;
}

function buildNotifications(
  role: UserRole | null,
  isTeamAdmin: boolean,
  data: FeedPrototypeData
): MockNotification[] {
  const course = data.course?.title ?? "Intro to TypeScript";
  const slug = data.course?.slug ?? "intro-to-typescript";
  const courseId = data.course?.id ?? 1;
  const lesson = data.lesson?.title ?? "Generics";
  const lessonId = data.lesson?.id ?? 1;
  const [p1 = "Sam Lee", p2 = "Priya Shah", p3 = "Diego Ruiz"] = data.people;
  const s = (strong: string) => ({ strong });
  const list: Omit<MockNotification, "read">[] = [];

  if (role === UserRole.Student) {
    list.push(
      {
        id: "s1",
        kind: "Instructor answered your Discussion Question",
        audience: "Student",
        icon: <GraduationCap className="size-4" />,
        parts: [s(p1), " answered your question on ", s(lesson), " in ", s(course), "."],
        to: `/courses/${slug}/lessons/${lessonId}#discussion`,
        minutesAgo: 12,
        email: true,
        needsYou: false,
      },
      {
        id: "s2",
        kind: "New Discussion Reply",
        audience: "Student",
        icon: <MessageSquare className="size-4" />,
        parts: [s(p2), " replied to your question on ", s(lesson), "."],
        to: `/courses/${slug}/lessons/${lessonId}#discussion`,
        minutesAgo: 95,
        email: false,
        needsYou: false,
      },
      {
        id: "s3",
        kind: "Refund Request declined",
        audience: "Student",
        icon: <Receipt className="size-4" />,
        parts: [
          "Your Refund Request for ",
          s(course),
          ' was declined: "Over 50% of the course watched." You can raise a new one.',
        ],
        to: `/courses/${slug}`,
        minutesAgo: 60 * 26,
        email: true,
        needsYou: false,
      },
      {
        id: "s4",
        kind: "Refund Request approved",
        audience: "Student",
        icon: <Receipt className="size-4" />,
        parts: ["Your Refund Request for ", s("CSS Grid Deep Dive"), " was approved. ", s("$49.00"), " is on its way back to you."],
        to: `/courses/${slug}`,
        minutesAgo: 60 * 24 * 5,
        email: true,
        needsYou: false,
      }
    );
  }

  if (isTeamAdmin) {
    list.push(
      {
        id: "t1",
        kind: "Seat claimed",
        audience: "Team Admin",
        icon: <UsersRound className="size-4" />,
        parts: [s(p3), " claimed a Seat on your Team Licence for ", s(course), ". 3 of 10 Seats are still unclaimed."],
        to: "/team",
        minutesAgo: 40,
        email: false,
        needsYou: false,
      },
      {
        id: "t2",
        kind: "Team Licence Refund Request approved",
        audience: "Team Admin",
        icon: <Receipt className="size-4" />,
        parts: [
          "Your Refund Request for the ",
          s(course),
          " Team Licence was approved. ",
          s("$490.00"),
          " is on its way back to you, and its 3 Unclaimed Seats can no longer be claimed.",
        ],
        to: "/team",
        minutesAgo: 60 * 30,
        email: true,
        needsYou: false,
      }
    );
  }

  if (role === UserRole.Instructor) {
    list.push(
      {
        id: "i1",
        kind: "New Discussion Question",
        audience: "Instructor",
        icon: <MessageSquare className="size-4" />,
        parts: [s(p1), " asked a question on ", s(lesson), " in ", s(course), "."],
        to: "/instructor/questions",
        minutesAgo: 5,
        email: true,
        needsYou: true,
      },
      {
        id: "i2",
        kind: "New Enrollment",
        audience: "Instructor",
        icon: <BookOpen className="size-4" />,
        parts: [s(p2), " enrolled on ", s(course), "."],
        to: `/instructor/${courseId}/students`,
        minutesAgo: 50,
        email: false,
        needsYou: false,
      },
      {
        id: "i3",
        kind: "Course rated",
        audience: "Instructor",
        icon: <Star className="size-4" />,
        parts: [s(p3), " rated ", s(course), " 4/5."],
        to: `/instructor/${courseId}`,
        minutesAgo: 60 * 3,
        email: false,
        needsYou: false,
      },
      {
        id: "i4",
        kind: "Course status changed by a Platform Admin",
        audience: "Instructor",
        icon: <GraduationCap className="size-4" />,
        parts: ["A Platform Admin published ", s(course), "."],
        to: `/instructor/${courseId}`,
        minutesAgo: 60 * 28,
        email: true,
        needsYou: false,
      },
      {
        id: "i5",
        kind: "Enrollment refunded",
        audience: "Instructor",
        icon: <Receipt className="size-4" />,
        parts: ["A Refund Request for ", s(course), " was approved. ", s(p1), " no longer has an Enrollment."],
        to: `/instructor/${courseId}/students`,
        minutesAgo: 60 * 24 * 4,
        email: false,
        needsYou: false,
      }
    );
  }

  if (role === UserRole.Admin) {
    list.push(
      {
        id: "a1",
        kind: "New Refund Request",
        audience: "Platform Admin",
        icon: <Receipt className="size-4" />,
        parts: [s(p1), " asked for a Refund on ", s(course), ' (Individual Purchase, $49.00): "The pace is too fast for me."'],
        to: "/admin/refunds",
        minutesAgo: 8,
        email: true,
        needsYou: true,
      },
      {
        id: "a2",
        kind: "New Refund Request",
        audience: "Platform Admin",
        icon: <Receipt className="size-4" />,
        parts: [s(p2), " asked for a Refund on ", s(course), ' (Team Licence, $490.00): "We picked another vendor."'],
        to: "/admin/refunds",
        minutesAgo: 60 * 20,
        email: true,
        needsYou: true,
      }
    );
  }

  list.push({
    id: "r1",
    kind: "Role changed",
    audience: "You",
    icon: <UserCog className="size-4" />,
    parts: [
      "A Platform Admin made you ",
      s(
        role === UserRole.Admin
          ? "a Platform Admin"
          : role === UserRole.Instructor
            ? "an Instructor"
            : "a Student"
      ),
      ".",
    ],
    to: "/dashboard",
    minutesAgo: 60 * 24 * 12,
    email: true,
    needsYou: false,
  });

  return list
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .map((n, i) => ({ ...n, read: i >= 3 }));
}

function timeAgo(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}

function dayGroup(minutes: number) {
  if (minutes < 60 * 24) return "Today";
  if (minutes < 60 * 48) return "Yesterday";
  return "Earlier";
}

// ─── Shared state ─────────────────────────────────────────────────────────

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<Variant, string> = {
  A: "Bell dropdown",
  B: "Inbox page + nav badge",
  C: "Bell drawer + page",
};

interface FeedCtx {
  variant: Variant;
  setVariant: (v: Variant) => void;
  items: MockNotification[];
  unread: number;
  markRead: (id: string, read?: boolean) => void;
  markAllRead: () => void;
}

const Ctx = createContext<FeedCtx | null>(null);
export function useFeedPrototype() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("FeedPrototypeProvider missing");
  return ctx;
}

export function FeedPrototypeProvider({
  role,
  userId,
  isTeamAdmin,
  data,
  children,
}: {
  role: UserRole | null;
  userId: number | null;
  isTeamAdmin: boolean;
  data: FeedPrototypeData;
  children: ReactNode;
}) {
  const [searchParams] = useSearchParams();
  const param = searchParams.get("variant");
  const [variant, setVariantState] = useState<Variant>("A");

  // The URL wins; otherwise remember the last variant across navigations
  // (clicking a Notification drops the search param).
  useEffect(() => {
    if (param && (VARIANTS as readonly string[]).includes(param)) {
      setVariantState(param as Variant);
      try {
        sessionStorage.setItem("feed-prototype-variant", param);
      } catch {}
    } else {
      try {
        const saved = sessionStorage.getItem("feed-prototype-variant");
        if (saved && (VARIANTS as readonly string[]).includes(saved))
          setVariantState(saved as Variant);
      } catch {}
    }
  }, [param]);

  // The Feed follows whichever user DevUI selected.
  const initial = useMemo(
    () => buildNotifications(role, isTeamAdmin, data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, role, isTeamAdmin]
  );
  const [items, setItems] = useState(initial);
  useEffect(() => setItems(initial), [initial]);

  const value: FeedCtx = {
    variant,
    setVariant: (v) => {
      setVariantState(v);
      try {
        sessionStorage.setItem("feed-prototype-variant", v);
      } catch {}
    },
    items,
    unread: items.filter((n) => !n.read).length,
    markRead: (id, read = true) =>
      setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read } : n))),
    markAllRead: () => setItems((xs) => xs.map((n) => ({ ...n, read: true }))),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function Sentence({ n }: { n: MockNotification }) {
  return (
    <>
      {n.parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <strong key={i} className="font-semibold text-foreground">
            {p.strong}
          </strong>
        )
      )}
    </>
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

// ─── Variant A: bell + dropdown in the sidebar header ─────────────────────

export function FeedSidebarHeaderSlot() {
  const { variant } = useFeedPrototype();
  if (variant !== "A") return null;
  return <BellDropdown />;
}

function BellDropdown() {
  const { items, unread, markRead, markAllRead } = useFeedPrototype();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {items.length === 0 && <EmptyFeed />}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                    navigate(n.to);
                  }}
                  className={cn(
                    "flex w-full gap-3 border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-accent",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {n.icon}
                  </span>
                  <span className="flex-1 text-muted-foreground">
                    <Sentence n={n} />
                    <span className="mt-1 block text-xs text-muted-foreground/70">
                      {timeAgo(n.minutesAgo)} ago
                    </span>
                  </span>
                  {!n.read && (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Variant B: nav item with a count + full inbox page ───────────────────

export function FeedSidebarNavSlot() {
  const { variant, unread } = useFeedPrototype();
  if (variant !== "B") return null;
  return (
    <NavLink
      to="/notifications-prototype"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Inbox className="size-4" />
      <span className="flex-1">Notifications</span>
      {unread > 0 && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
          {unread}
        </span>
      )}
    </NavLink>
  );
}

export function FeedInboxPage() {
  const { items, unread, markRead, markAllRead } = useFeedPrototype();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const navigate = useNavigate();
  const shown = tab === "all" ? items : items.filter((n) => !n.read);
  const groups = ["Today", "Yesterday", "Earlier"]
    .map((g) => ({ g, xs: shown.filter((n) => dayGroup(n.minutesAgo) === g) }))
    .filter((x) => x.xs.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unread === 0 ? "You're all caught up." : `${unread} unread`}
          </p>
        </div>
        <button
          onClick={markAllRead}
          disabled={unread === 0}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-40"
        >
          <Check className="size-4" /> Mark all as read
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {(["all", "unread"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
            {t === "unread" && unread > 0 && ` (${unread})`}
          </button>
        ))}
      </div>

      {groups.length === 0 && <EmptyFeed />}
      {groups.map(({ g, xs }) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {g}
          </h2>
          <div className="divide-y rounded-lg border">
            {xs.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "group flex items-start gap-4 px-4 py-4",
                  !n.read && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "mt-2 size-2 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-primary"
                  )}
                />
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {n.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                      {n.audience}
                    </span>
                    <span>{n.kind}</span>
                    <span>· {timeAgo(n.minutesAgo)} ago</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <Sentence n={n} />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => markRead(n.id, !n.read)}
                    className="rounded px-2 py-1 text-xs text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                  >
                    Mark {n.read ? "unread" : "read"}
                  </button>
                  <button
                    onClick={() => {
                      markRead(n.id);
                      navigate(n.to);
                    }}
                    className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent"
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Variant C: bell in the user footer → slide-over drawer, + the page ───

export function FeedSidebarFooterSlot() {
  const { variant } = useFeedPrototype();
  if (variant !== "C") return null;
  return <BellDrawer />;
}

function BellDrawer() {
  const { items, unread, markRead, markAllRead } = useFeedPrototype();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const needsYou = items.filter((n) => n.needsYou && !n.read);
  const updates = items.filter((n) => !needsYou.includes(n));

  const row = (n: MockNotification) => (
    <button
      key={n.id}
      onClick={() => {
        markRead(n.id);
        setOpen(false);
        navigate(n.to);
      }}
      className={cn(
        "flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent",
        n.read ? "opacity-70" : ""
      )}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {!n.read && <span className="size-1.5 rounded-full bg-primary" />}
        {n.icon}
        <span className={cn(!n.read && "font-semibold text-foreground")}>
          {n.kind}
        </span>
        <span className="ml-auto">{timeAgo(n.minutesAgo)}</span>
      </span>
      <span className="text-muted-foreground">
        <Sentence n={n} />
      </span>
    </button>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Notifications"
        className="relative rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-red-600 ring-2 ring-sidebar" />
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[26rem] flex-col border-l bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-semibold">Notifications</span>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Mark all as read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded p-1 hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-2">
              {items.length === 0 && <EmptyFeed />}
              {needsYou.length > 0 && (
                <section>
                  <h3 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-600">
                    Waiting on you
                  </h3>
                  {needsYou.map(row)}
                </section>
              )}
              {updates.length > 0 && (
                <section>
                  <h3 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Updates
                  </h3>
                  {updates.map(row)}
                </section>
              )}
            </div>
            <Link
              to="/notifications-prototype"
              onClick={() => setOpen(false)}
              className="border-t px-4 py-3 text-center text-sm font-medium text-primary hover:bg-accent"
            >
              View all notifications
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}

// ─── Floating variant switcher ────────────────────────────────────────────

export function FeedPrototypeSwitcher() {
  const { variant, setVariant } = useFeedPrototype();
  const [, setSearchParams] = useSearchParams();

  function go(delta: number) {
    const i = VARIANTS.indexOf(variant);
    const next = VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length];
    setVariant(next);
    setSearchParams(
      (p) => {
        p.set("variant", next);
        return p;
      },
      { replace: true }
    );
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-lg ring-1 ring-white/10">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 font-medium">
        Feed prototype {variant} ({VARIANT_NAMES[variant]})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
