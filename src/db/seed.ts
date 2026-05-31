/**
 * Local seed: creates a demo user and a friend whose birthday is tomorrow, so you
 * can exercise the cron → generate → approve → deliver flow end-to-end.
 *
 * Usage: `npm run db:seed` (requires DATABASE_URL).
 */
import { DateTime } from "luxon";
import { db } from "./client";
import { users, friends, relationships, specialDays } from "./schema";
import { hashPhone } from "../lib/phone";

async function main() {
  const phone = "+15555550100";
  const [user] = await db
    .insert(users)
    .values({
      phoneE164: phone,
      phoneHash: hashPhone(phone),
      displayName: "Demo User",
      timezone: "America/Los_Angeles",
      waVerified: true,
    })
    .returning();

  const tomorrow = DateTime.now().plus({ days: 1 });

  const [friend] = await db
    .insert(friends)
    .values({
      ownerUserId: user.id,
      name: "Asha",
      timezone: "America/New_York",
      notes: "Loves gardening and old Hindi film music; just adopted a kitten named Mochi.",
    })
    .returning();

  await db.insert(relationships).values({
    ownerUserId: user.id,
    friendId: friend.id,
    relationType: "sibling",
  });

  await db.insert(specialDays).values({
    friendId: friend.id,
    type: "birthday",
    month: tomorrow.month,
    day: tomorrow.day,
    year: 1990,
    recurring: true,
  });

  console.log("Seeded demo user (%s) and friend Asha with a birthday on %s.", phone, tomorrow.toFormat("LLL d"));
  console.log("Run `curl http://localhost:3000/api/cron/scan` to kick off the workflow.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
