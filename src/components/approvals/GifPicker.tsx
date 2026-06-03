"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

export default function GifPicker({
  draftId,
  defaultQuery,
}: {
  draftId: string;
  defaultQuery: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(defaultQuery || "");
  const [gifs, setGifs] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gifs?q=${encodeURIComponent(query || "celebration")}`);
      const json = await res.json().catch(() => ({}));
      setEnabled(json?.data?.enabled !== false);
      setGifs(json?.data?.gifs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && gifs.length === 0) search(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function pick(url: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/approvals/${draftId}/gif`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        🔀 Change GIF
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 p-3">
      <form onSubmit={(e) => { e.preventDefault(); search(q); }} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIFs…" />
        <Button type="submit" variant="ghost" disabled={loading}>Search</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </form>
      {!enabled && (
        <p className="text-xs text-amber-700">GIF search needs GIPHY_API_KEY to be set.</p>
      )}
      {loading ? (
        <p className="text-sm text-neutral-400">Searching…</p>
      ) : (
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {gifs.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => pick(u)}
              disabled={saving}
              className="overflow-hidden rounded-lg border border-neutral-200 hover:border-brand-400 disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-24 w-full object-cover" />
            </button>
          ))}
          {gifs.length === 0 && enabled && (
            <p className="col-span-full text-sm text-neutral-400">No GIFs — try another search.</p>
          )}
        </div>
      )}
    </div>
  );
}
