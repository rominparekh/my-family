"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { RELATION_TYPES, SPECIAL_DAY_TYPES, CONTENT_KINDS } from "@/lib/constants";

interface SpecialDay {
  id: string;
  type: string;
  label: string | null;
  month: number;
  day: number;
  year: number | null;
}
interface Relationship {
  id: string;
  relationType: string;
}
interface Photo {
  id: string;
  blobUrl: string;
  caption: string | null;
}
interface Friend {
  id: string;
  name: string;
  phoneE164: string | null;
  timezone: string;
  notes: string | null;
  preferredContentKind: string;
  linkedUserId: string | null;
  relationships: Relationship[];
  specialDays: SpecialDay[];
  photos: Photo[];
}

const KIND_LABEL: Record<string, string> = {
  text: "Message",
  photo: "Photo",
  video: "Video",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function FriendEditor({ friend }: { friend: Friend }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(input: RequestInfo, init?: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(input, init);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Request failed");
      }
      router.refresh();
      return json;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/friends" className="text-sm text-neutral-500 hover:underline">
        ← All friends
      </Link>

      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl text-brand-700">
          {friend.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{friend.name}</h1>
          {friend.linkedUserId && <Badge tone="green">Already on the platform</Badge>}
        </div>
      </div>

      <DetailsCard friend={friend} call={call} busy={busy} />
      <RelationshipsCard friend={friend} call={call} busy={busy} />
      <SpecialDaysCard friend={friend} call={call} busy={busy} />
      <PhotosCard friend={friend} router={router} />
      <GenerateTestCard friend={friend} router={router} />
      {!friend.linkedUserId && <InviteCard friend={friend} />}

      <Card className="border-red-200">
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-600">Remove this friend and all their data.</p>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Delete ${friend.name}?`)) return;
              await call(`/api/friends/${friend.id}`, { method: "DELETE" });
              router.push("/friends");
            }}
          >
            Delete
          </Button>
        </div>
      </Card>
    </div>
  );
}

type CallFn = (input: RequestInfo, init?: RequestInit) => Promise<unknown>;

function DetailsCard({
  friend,
  call,
  busy,
}: {
  friend: Friend;
  call: CallFn;
  busy: boolean;
}) {
  const [name, setName] = useState(friend.name);
  const [phone, setPhone] = useState(friend.phoneE164 ?? "");
  const [timezone, setTimezone] = useState(friend.timezone);
  const [notes, setNotes] = useState(friend.notes ?? "");
  const [kind, setKind] = useState(friend.preferredContentKind);

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14155550123" />
        </div>
        <div>
          <Label>Timezone (IANA)</Label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/Los_Angeles" />
        </div>
        <div>
          <Label>Wish type for their special days</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {CONTENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k] ?? k}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label>Notes (used to personalise wishes)</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Loves hiking and bad puns; just started a new job…"
        />
      </div>
      <Button
        disabled={busy}
        onClick={() =>
          call(`/api/friends/${friend.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              phone: phone || null,
              timezone,
              notes: notes || null,
              preferredContentKind: kind,
            }),
          })
        }
      >
        Save details
      </Button>
    </Card>
  );
}

function RelationshipsCard({
  friend,
  call,
  busy,
}: {
  friend: Friend;
  call: CallFn;
  busy: boolean;
}) {
  const current = friend.relationships[0];

  async function setRelationship(value: string) {
    if (!value) {
      // Clear the relationship.
      if (current) {
        await call(`/api/friends/${friend.id}/relationships?relId=${current.id}`, {
          method: "DELETE",
        });
      }
      return;
    }
    await call(`/api/friends/${friend.id}/relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relationType: value }),
    });
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Relationship</h2>
      <p className="text-sm text-neutral-500">How is this person related to you?</p>
      <Select
        className="max-w-xs"
        value={current?.relationType ?? ""}
        disabled={busy}
        onChange={(e) => setRelationship(e.target.value)}
      >
        <option value="">No relationship set</option>
        {RELATION_TYPES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
    </Card>
  );
}

function SpecialDaysCard({
  friend,
  call,
  busy,
}: {
  friend: Friend;
  call: CallFn;
  busy: boolean;
}) {
  const [type, setType] = useState<(typeof SPECIAL_DAY_TYPES)[number]>("birthday");
  const [label, setLabel] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Special days</h2>
      <ul className="space-y-2">
        {friend.specialDays.length === 0 && (
          <li className="text-sm text-neutral-400">None yet.</li>
        )}
        {friend.specialDays.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
            <span>
              <span className="font-medium capitalize">{d.label || d.type}</span> ·{" "}
              {MONTHS[d.month - 1]} {d.day}
              {d.year ? `, ${d.year}` : ""}
            </span>
            <button
              className="text-neutral-400 hover:text-red-600"
              disabled={busy}
              onClick={() =>
                call(`/api/friends/${friend.id}/special-days?dayId=${d.id}`, { method: "DELETE" })
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-5">
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {SPECIAL_DAY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        {type === "custom" && (
          <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        )}
        <Input placeholder="MM" inputMode="numeric" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Input placeholder="DD" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
        <Input placeholder="YYYY (opt)" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
      </div>
      <Button
        variant="ghost"
        disabled={busy || !month || !day || (type === "custom" && !label)}
        onClick={async () => {
          await call(`/api/friends/${friend.id}/special-days`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              label: type === "custom" ? label : undefined,
              month: Number(month),
              day: Number(day),
              year: year ? Number(year) : undefined,
              recurring: true,
            }),
          });
          setLabel("");
          setMonth("");
          setDay("");
          setYear("");
        }}
      >
        Add special day
      </Button>
    </Card>
  );
}

function GenerateTestCard({
  friend,
  router,
}: {
  friend: Friend;
  router: ReturnType<typeof useRouter>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const hasDays = friend.specialDays.length > 0;

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/friends/${friend.id}/generate-now`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed");
      setMsg("Generated! Open Approvals to review it.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 border-brand-200">
      <h2 className="font-semibold">Generate a wish now (test)</h2>
      <p className="text-sm text-neutral-600">
        Generate a wish for {friend.name}&apos;s nearest special day immediately and send it
        to your <Link href="/approvals" className="text-brand-600 hover:underline">Approvals</Link>{" "}
        inbox to review — no waiting for the scheduler.
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={generate} disabled={busy || !hasDays}>
          {busy ? "Generating…" : "Generate now"}
        </Button>
        {!hasDays && <span className="text-xs text-neutral-400">Add a special day first.</span>}
      </div>
      {msg && <p className="text-sm text-neutral-600">{msg}</p>}
    </Card>
  );
}

function InviteCard({ friend }: { friend: Friend }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/friends/${friend.id}/invite`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || "Could not invite");
      setMsg("Invite sent! They'll be auto-linked when they join.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Invite to Parekh Family</h2>
      {friend.phoneE164 ? (
        <>
          <p className="text-sm text-neutral-600">
            Send {friend.name} a join link. When they sign up with this number, they&apos;ll
            be linked automatically.
          </p>
          <Button variant="ghost" onClick={invite} disabled={busy}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-neutral-400">Add a phone number above to invite them.</p>
      )}
      {msg && <p className="text-sm text-neutral-600">{msg}</p>}
    </Card>
  );
}

function PhotosCard({
  friend,
  router,
}: {
  friend: Friend;
  router: ReturnType<typeof useRouter>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/friends/${friend.id}/photos`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || "Upload failed");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(photoId: string) {
    setBusy(true);
    await fetch(`/api/friends/${friend.id}/photos?photoId=${photoId}`, { method: "DELETE" });
    router.refresh();
    setBusy(false);
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Photos</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {friend.photos.map((p) => (
          <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
            <Image src={p.blobUrl} alt={p.caption ?? ""} fill className="object-cover" />
            <button
              onClick={() => remove(p.id)}
              className="absolute right-1 top-1 hidden rounded-full bg-black/60 px-2 text-xs text-white group-hover:block"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" />
        <Button variant="ghost" onClick={upload} disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </Card>
  );
}
