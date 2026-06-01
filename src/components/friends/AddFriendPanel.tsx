"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { RELATION_TYPES, SPECIAL_DAY_TYPES } from "@/lib/constants";

export default function AddFriendPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"single" | "import">("single");

  // single-add fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationType, setRelationType] = useState("");
  const [dayType, setDayType] = useState<(typeof SPECIAL_DAY_TYPES)[number]>("birthday");
  const [dayLabel, setDayLabel] = useState("");
  const [bMonth, setBMonth] = useState("");
  const [bDay, setBDay] = useState("");
  const [bYear, setBYear] = useState("");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addSingle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const specialDays =
        bMonth && bDay
          ? [
              {
                type: dayType,
                label: dayType === "custom" ? dayLabel : undefined,
                month: Number(bMonth),
                day: Number(bDay),
                year: bYear ? Number(bYear) : undefined,
                recurring: true,
              },
            ]
          : undefined;
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: phone || undefined,
          timezone: tz,
          relationType: relationType || undefined,
          specialDays,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not add friend");
      const linked = json.data?.linkedTo;
      setMsg(linked ? `Added — linked to existing member ${linked.displayName ?? ""}.` : "Added!");
      setName("");
      setPhone("");
      setRelationType("");
      setDayType("birthday");
      setDayLabel("");
      setBMonth("");
      setBDay("");
      setBYear("");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("defaultTimezone", tz);
      const res = await fetch("/api/friends/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Import failed");
      const d = json.data;
      setMsg(`Imported ${d.created} (${d.withBirthday} with birthdays, ${d.linked} linked).`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ Add friends</Button>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          <button
            onClick={() => setTab("single")}
            className={`rounded-md px-3 py-1 text-sm ${tab === "single" ? "bg-white shadow-sm" : "text-neutral-500"}`}
          >
            Add one
          </button>
          <button
            onClick={() => setTab("import")}
            className={`rounded-md px-3 py-1 text-sm ${tab === "import" ? "bg-white shadow-sm" : "text-neutral-500"}`}
          >
            Import file
          </button>
        </div>
        <button onClick={() => setOpen(false)} className="text-sm text-neutral-400 hover:text-neutral-600">
          Close
        </button>
      </div>

      {tab === "single" ? (
        <form onSubmit={addSingle} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+14155550123"
              />
            </div>
            <div>
              <Label>Relationship</Label>
              <Select value={relationType} onChange={(e) => setRelationType(e.target.value)}>
                <option value="">—</option>
                {RELATION_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Special day (optional)</Label>
              <Select value={dayType} onChange={(e) => setDayType(e.target.value as typeof dayType)}>
                {SPECIAL_DAY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            {dayType === "custom" && (
              <div>
                <Label>Label for this day</Label>
                <Input
                  placeholder="e.g. Graduation"
                  value={dayLabel}
                  onChange={(e) => setDayLabel(e.target.value)}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>Date (leave blank to skip)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="MM"
                  inputMode="numeric"
                  value={bMonth}
                  onChange={(e) => setBMonth(e.target.value)}
                />
                <Input
                  placeholder="DD"
                  inputMode="numeric"
                  value={bDay}
                  onChange={(e) => setBDay(e.target.value)}
                />
                <Input
                  placeholder="YYYY (opt)"
                  inputMode="numeric"
                  value={bYear}
                  onChange={(e) => setBYear(e.target.value)}
                />
              </div>
            </div>
          </div>
          {msg && <p className="text-sm text-neutral-600">{msg}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save friend"}
          </Button>
        </form>
      ) : (
        <form onSubmit={importFile} className="space-y-3">
          <p className="text-sm text-neutral-500">
            Upload a <code>.vcf</code> (vCard) or <code>.csv</code> export. We&apos;ll pull
            names, phone numbers, and birthdays where present.
          </p>
          <input ref={fileRef} type="file" accept=".vcf,.csv,text/vcard,text/csv" required />
          {msg && <p className="text-sm text-neutral-600">{msg}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </form>
      )}
    </Card>
  );
}
