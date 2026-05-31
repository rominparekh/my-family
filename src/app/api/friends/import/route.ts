import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { friends, specialDays } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { normalizeToE164, hashPhone } from "@/lib/phone";
import { findLinkableUser } from "@/lib/friends";
import { parseVCard, parseCsv, type ImportedContact } from "@/lib/import";

const MAX_IMPORT = 500;

// POST /api/friends/import
//   multipart/form-data: file (.vcf or .csv), defaultTimezone?
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    const defaultTz = (form.get("defaultTimezone") as string | null) || user.timezone || "UTC";

    if (!(file instanceof File)) return fail("No file provided");
    const text = await file.text();

    const isVcf = file.name.toLowerCase().endsWith(".vcf") || /BEGIN:VCARD/i.test(text);
    let contacts: ImportedContact[] = isVcf ? parseVCard(text) : parseCsv(text);

    if (!contacts.length) return fail("No contacts found in the file");
    if (contacts.length > MAX_IMPORT) contacts = contacts.slice(0, MAX_IMPORT);

    let created = 0;
    let linked = 0;
    let withBirthday = 0;

    for (const c of contacts) {
      let phoneE164: string | null = null;
      let phoneHash: string | null = null;
      if (c.phone) {
        phoneE164 = normalizeToE164(c.phone);
        if (phoneE164) phoneHash = hashPhone(phoneE164);
      }

      const linkable = await findLinkableUser(phoneE164, user.id);
      if (linkable) linked++;

      const [friend] = await db
        .insert(friends)
        .values({
          ownerUserId: user.id,
          name: c.name,
          phoneE164,
          phoneHash,
          timezone: defaultTz,
          linkedUserId: linkable?.id ?? null,
        })
        .returning();
      created++;

      if (c.birthday) {
        await db.insert(specialDays).values({
          friendId: friend.id,
          type: "birthday",
          month: c.birthday.month,
          day: c.birthday.day,
          year: c.birthday.year ?? null,
          recurring: true,
        });
        withBirthday++;
      }
    }

    return ok({ created, linked, withBirthday, total: contacts.length });
  });
}
