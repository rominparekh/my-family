"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Nudges users to install the PWA so notifications work (required on iOS).
 * - Android/desktop Chromium: captures `beforeinstallprompt` and offers a button.
 * - iOS Safari (not installed): shows Add-to-Home-Screen instructions.
 * Hidden when already installed; dismissible per session.
 */
export default function InstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("pf_install_dismissed")) return;

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS-only
      window.navigator.standalone === true;
    if (standalone) return; // already installed

    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    setIsIOS(ios);
    if (ios) {
      setShow(true); // iOS can't prompt programmatically — show instructions
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  function dismiss() {
    sessionStorage.setItem("pf_install_dismissed", "1");
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-3 shadow-lg">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <span className="text-2xl">📲</span>
        <p className="flex-1 text-sm text-neutral-700">
          {isIOS ? (
            <>
              Install Parekh Family for reminders: tap <span className="font-medium">Share</span>{" "}
              then <span className="font-medium">Add to Home Screen</span>, and open it from
              there.
            </>
          ) : (
            <>Install Parekh Family for one-tap access and reminders.</>
          )}
        </p>
        {!isIOS && deferred && (
          <button
            onClick={install}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Install
          </button>
        )}
        <button onClick={dismiss} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500">
          Dismiss
        </button>
      </div>
    </div>
  );
}
