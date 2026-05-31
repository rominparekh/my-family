import { ok, handle } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";

export async function POST() {
  return handle(async () => {
    await destroySession();
    return ok({ loggedOut: true });
  });
}
