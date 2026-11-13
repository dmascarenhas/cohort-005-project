import { data } from "react-router";
import type { Route } from "./+types/api.knock-token";
import { getCurrentUserId } from "~/lib/session";
import { signFeedToken } from "~/lib/knock.server";

// The Notification Feed calls this shortly before its user token expires. It
// signs for whoever the session says is signed in now, and says who that is,
// so a tab whose user was switched elsewhere can reload instead of mixing
// users.

export async function issueFeedToken(request: Request): Promise<Response> {
  const userId = await getCurrentUserId(request);

  if (!userId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const token = await signFeedToken(userId);

  if (!token) {
    throw data("Notifications aren't configured.", { status: 503 });
  }

  return Response.json(
    { userId, token },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  return issueFeedToken(request);
}
