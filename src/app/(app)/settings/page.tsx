import { getCurrentUser } from "@/lib/auth/current-user";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-neutral-500">Your profile and privacy.</p>
      </div>
      <SettingsForm
        initial={{
          displayName: user.displayName ?? "",
          timezone: user.timezone,
          discoverable: user.discoverable,
          phoneE164: user.phoneE164,
        }}
      />
    </div>
  );
}
