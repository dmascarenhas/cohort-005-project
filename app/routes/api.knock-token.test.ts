import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCurrentUserId } from "~/lib/session";
import { issueFeedToken } from "./api.knock-token";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

async function requestAs(userId: number | null) {
  const headers = new Headers();
  if (userId !== null) {
    const setCookie = await setCurrentUserId(
      new Request("http://localhost/"),
      userId
    );
    headers.set("Cookie", setCookie.split(";")[0] ?? "");
  }
  return new Request("http://localhost/api/knock-token", { headers });
}

function decodeVerified(token: string) {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw new Error("Not a JWT");

  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    createPublicKey(publicKey),
    Buffer.from(signature, "base64url")
  );
  expect(valid).toBe(true);

  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

describe("issueFeedToken", () => {
  beforeEach(() => {
    vi.stubEnv(
      "KNOCK_SIGNING_KEY",
      Buffer.from(privateKey).toString("base64")
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs a one-hour token for the session's current user", async () => {
    const response = await issueFeedToken(await requestAs(7));
    const body = await response.json();

    expect(body.userId).toBe(7);
    const claims = decodeVerified(body.token);
    expect(claims.sub).toBe("7");
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it("refuses when nobody is signed in", async () => {
    const thrown = await issueFeedToken(await requestAs(null)).catch(
      (error: unknown) => error
    );

    expect(thrown).toMatchObject({ init: { status: 401 } });
  });

  it("refuses when no signing key is configured", async () => {
    vi.stubEnv("KNOCK_SIGNING_KEY", "");

    const thrown = await issueFeedToken(await requestAs(7)).catch(
      (error: unknown) => error
    );

    expect(thrown).toMatchObject({ init: { status: 503 } });
  });
});
