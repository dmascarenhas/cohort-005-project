import { afterEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "~/db/schema";
import type { Notification } from "~/lib/notifications";
import { sendNotifications, type KnockTrigger } from "./knock.server";

const roleChanged: Notification = {
  workflow: "role-changed",
  recipients: [
    { id: "7", name: "Emma Wilson", email: "emma@example.com", avatar: null },
  ],
  actor: { id: "1", name: "Alex Rivera", email: "alex@example.com", avatar: null },
  data: { newRole: UserRole.Instructor, url: "/dashboard" },
};

function fakeKnock(fail = false) {
  const calls: Parameters<KnockTrigger["trigger"]>[] = [];
  const knock: KnockTrigger = {
    async trigger(...args) {
      calls.push(args);
      if (fail) throw new Error("Knock is down");
      return { workflow_run_id: "run_1" };
    },
  };
  return { knock, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendNotifications", () => {
  it("triggers the workflow named by the Notification, identifying people inline", async () => {
    const { knock, calls } = fakeKnock();

    await sendNotifications([roleChanged], { knock, devEmailRedirect: null });

    expect(calls).toEqual([
      [
        "role-changed",
        {
          recipients: roleChanged.recipients,
          actor: roleChanged.actor,
          data: { newRole: "instructor", url: "/dashboard" },
        },
      ],
    ]);
  });

  it("leaves the actor out when there isn't one", async () => {
    const { knock, calls } = fakeKnock();

    await sendNotifications([{ ...roleChanged, actor: null }], {
      knock,
      devEmailRedirect: null,
    });

    expect(calls[0]?.[1]).not.toHaveProperty("actor");
  });

  it("sends every email to the dev redirect address when one is set", async () => {
    const { knock, calls } = fakeKnock();

    await sendNotifications([roleChanged], {
      knock,
      devEmailRedirect: "me@example.com",
    });

    const body = calls[0]?.[1];
    expect(body?.recipients.map((person) => person.email)).toEqual([
      "me@example.com",
    ]);
    expect(body?.actor?.email).toBe("me@example.com");
    expect(body?.recipients[0]?.name).toBe("Emma Wilson");
  });

  it("logs a Knock failure instead of throwing it", async () => {
    const { knock } = fakeKnock(true);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      sendNotifications([roleChanged], { knock, devEmailRedirect: null })
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(
      "Could not send a Notification through Knock",
      expect.objectContaining({ workflow: "role-changed", recipientIds: ["7"] })
    );
  });

  it("sends nothing when Knock isn't configured", async () => {
    vi.stubEnv("KNOCK_SECRET_API_KEY", "");

    await expect(sendNotifications([roleChanged])).resolves.toBeUndefined();

    vi.unstubAllEnvs();
  });
});
