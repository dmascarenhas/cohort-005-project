import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { changeUserRole } from "./users.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  platformAdmin = db
    .insert(schema.users)
    .values({
      name: "Pat Admin",
      email: "pat@example.com",
      role: UserRole.Admin,
      avatarUrl: "https://example.com/pat.png",
    })
    .returning()
    .get();
});

function roleOf(userId: number) {
  return db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get()?.role;
}

describe("changeUserRole", () => {
  it("changes the role and tells the person, with the Platform Admin as actor", () => {
    const result = changeUserRole(
      db,
      platformAdmin.id,
      base.user.id,
      UserRole.Instructor
    );

    expect(roleOf(base.user.id)).toBe(UserRole.Instructor);
    expect(result).toEqual({
      ok: true,
      notifications: [
        {
          workflow: "role-changed",
          recipients: [
            {
              id: String(base.user.id),
              name: "Test User",
              email: "test@example.com",
              avatar: null,
            },
          ],
          actor: {
            id: String(platformAdmin.id),
            name: "Pat Admin",
            email: "pat@example.com",
            avatar: "https://example.com/pat.png",
          },
          data: { newRole: UserRole.Instructor, url: "/dashboard" },
        },
      ],
    });
  });

  it("doesn't notify a Platform Admin who changes their own role", () => {
    const result = changeUserRole(
      db,
      platformAdmin.id,
      platformAdmin.id,
      UserRole.Student
    );

    expect(roleOf(platformAdmin.id)).toBe(UserRole.Student);
    expect(result).toEqual({ ok: true, notifications: [] });
  });

  it("doesn't notify when the role is unchanged", () => {
    const result = changeUserRole(
      db,
      platformAdmin.id,
      base.user.id,
      UserRole.Student
    );

    expect(result).toEqual({ ok: true, notifications: [] });
  });

  it("refuses a person who doesn't exist, and notifies nobody", () => {
    const result = changeUserRole(db, platformAdmin.id, 9999, UserRole.Admin);

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "User not found.",
    });
  });
});
