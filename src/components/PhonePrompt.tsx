"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Card } from "@/components/ui";

/**
 * Popup shown when the logged-in user hasn't added a phone number. Without one we
 * can't send wishes or deliver drafts for approval over WhatsApp. Dismissible per
 * browser session; never shows on the settings page itself.
 */
export default function PhonePrompt({ hasPhone }: { hasPhone: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasPhone) return;
    if (pathname?.startsWith("/settings")) return;
    const dismissed = sessionStorage.getItem("pf_phone_prompt_dismissed");
    if (!dismissed) setOpen(true);
  }, [hasPhone, pathname]);

  if (!open) return null;

  function dismiss() {
    sessionStorage.setItem("pf_phone_prompt_dismissed", "1");
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md space-y-4">
        <div className="text-3xl">📱</div>
        <div>
          <h2 className="text-lg font-bold">Add your phone number</h2>
          <p className="mt-1 text-sm text-neutral-600">
            We use your WhatsApp number to send you wishes and to deliver generated
            drafts for your approval. <span className="font-medium">Until you add one,
            the app can&apos;t send messages or prepare new wishes for review.</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings" onClick={dismiss}>
            <Button>Add phone number</Button>
          </Link>
          <Button variant="ghost" onClick={dismiss}>
            Maybe later
          </Button>
        </div>
      </Card>
    </div>
  );
}
