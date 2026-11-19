import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { seed } from "./seed";

describe("seed", () => {
  it("puts at least one row in every table", async () => {
    // Keep the seed away from the real Knock account.
    vi.stubEnv("KNOCK_SECRET_API_KEY", "");
    vi.spyOn(console, "log").mockImplementation(() => {});

    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    await seed(sqlite);

    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as { name: string }[];
    const emptyTables = tables
      .map(({ name }) => name)
      .filter((name) => {
        const { n } = sqlite
          .prepare(`SELECT count(*) AS n FROM "${name}"`)
          .get() as { n: number };
        return n === 0;
      });

    expect(emptyTables).toEqual([]);
  }, 60_000);
});
