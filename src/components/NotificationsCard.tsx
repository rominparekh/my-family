"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

type State = "loading" | "unsupported" | "denied" | "off" | "on";

export default function NotificationsCard() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isIOS = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS-only
      window.navigator.standalone === true);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Could not save subscription");
      setState("on");
      setMsg("Notifications enabled on this device.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("Notifications disabled on this device.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed");
      setMsg("Test notification sent — check your device.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Phone notifications</h2>
      <p className="text-sm text-neutral-600">
        Get a push notification when a wish is ready to send, timed to the friend&apos;s
        special day. Then tap through to send it from your WhatsApp.
      </p>

      {state === "unsupported" && (
        <p className="text-sm text-amber-700">
          This browser doesn&apos;t support push notifications.
          {isIOS && !isStandalone
            ? " On iPhone, tap Share → Add to Home Screen, open it from there, then enable."
            : ""}
        </p>
      )}
      {state === "denied" && (
        <p className="text-sm text-amber-700">
          Notifications are blocked in your browser settings — allow them for this site, then
          reload.
        </p>
      )}
      {state === "loading" && <p className="text-sm text-neutral-400">Checking…</p>}

      {state === "off" && (
        <Button onClick={enable} disabled={busy}>
          {busy ? "Enabling…" : "Enable notifications"}
        </Button>
      )}
      {state === "on" && (
        <div className="flex gap-2">
          <Button onClick={test} disabled={busy}>
            {busy ? "Sending…" : "Send test notification"}
          </Button>
          <Button variant="ghost" onClick={disable} disabled={busy}>
            Disable
          </Button>
        </div>
      )}

      {isIOS && !isStandalone && state !== "unsupported" && (
        <p className="text-xs text-neutral-400">
          On iPhone, notifications only work after you add this app to your Home Screen
          (Share → Add to Home Screen) and open it from there.
        </p>
      )}
      {msg && <p className="text-sm text-neutral-600">{msg}</p>}
    </Card>
  );
}
