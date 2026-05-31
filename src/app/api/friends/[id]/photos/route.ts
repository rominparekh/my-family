import { put, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { friendPhotos } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { getOwnedFriend } from "@/lib/friends";

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// POST /api/friends/:id/photos  (multipart/form-data: file, caption?)
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return fail("Photo storage is not configured (BLOB_READ_WRITE_TOKEN).", 503);
    }

    const form = await req.formData();
    const file = form.get("file");
    const caption = (form.get("caption") as string | null)?.slice(0, 280) ?? null;

    if (!(file instanceof File)) return fail("No file provided");
    if (file.size > MAX_BYTES) return fail("Image must be under 8 MB", 413);
    if (!ALLOWED.includes(file.type)) return fail("Unsupported image type", 415);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `friends/${friend.id}/${Date.now()}-${safeName}`;

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
    });

    const [photo] = await db
      .insert(friendPhotos)
      .values({
        friendId: friend.id,
        blobUrl: blob.url,
        pathname: blob.pathname,
        caption,
        uploadedByUserId: user.id,
      })
      .returning();

    return ok(photo, { status: 201 });
  });
}

// DELETE /api/friends/:id/photos?photoId=...
export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);

    const photoId = new URL(req.url).searchParams.get("photoId");
    if (!photoId) return fail("photoId is required");

    const photo = await db.query.friendPhotos.findFirst({
      where: eq(friendPhotos.id, photoId),
    });
    if (!photo || photo.friendId !== friend.id) return fail("Photo not found", 404);

    try {
      await del(photo.blobUrl);
    } catch (err) {
      console.warn("[photos] blob delete failed (continuing):", err);
    }
    await db.delete(friendPhotos).where(eq(friendPhotos.id, photoId));
    return ok({ deleted: true });
  });
}
