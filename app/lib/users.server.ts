import { eq } from "drizzle-orm";
import { users, type UserRole } from "~/db/schema";
import { notify, type Notification } from "~/lib/notifications";
import type { Db } from "~/lib/refunds.server";

// ─── People ───
// A Platform Admin's changes to other people's accounts. Every function takes
// the database first, so tests can hand in an in-memory one.

export type RoleChangeResult =
  | { ok: true; notifications: Notification[] }
  | { ok: false; status: 404; error: string };

/**
 * A Platform Admin gives someone a new role. They are told about it in their
 * Notification Feed and by email, unless the Platform Admin changed their own
 * role or the role didn't actually change.
 */
export function changeUserRole(
  db: Db,
  platformAdminId: number,
  userId: number,
  role: UserRole
): RoleChangeResult {
  const person = db.select().from(users).where(eq(users.id, userId)).get();
  if (!person) {
    return { ok: false, status: 404, error: "User not found." };
  }

  const platformAdmin = db
    .select()
    .from(users)
    .where(eq(users.id, platformAdminId))
    .get();

  if (person.role === role) {
    return { ok: true, notifications: [] };
  }

  db.update(users).set({ role }).where(eq(users.id, userId)).run();

  return {
    ok: true,
    notifications: notify("role-changed", [person], platformAdmin ?? null, {
      newRole: role,
      url: "/dashboard",
    }),
  };
}
