import { getCurrentUser } from "@/lib/auth/current-user";
import { userMonthToDate } from "@/lib/ai/usage";
import { Card } from "@/components/ui";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  text: "Messages",
  image: "Photos",
  video: "Videos",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const usage = await userMonthToDate(user.id);
  const fmt = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

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
          username: user.username ?? "",
          phoneE164: user.phoneE164 ?? "",
        }}
      />

      <Card className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">AI usage this month</h2>
          <span className="text-2xl font-bold">{fmt(usage.totalUsd)}</span>
        </div>
        {Object.keys(usage.byKind).length === 0 ? (
          <p className="text-sm text-neutral-400">No generation costs yet this month.</p>
        ) : (
          <div className="flex flex-wrap gap-4 text-sm text-neutral-600">
            {Object.entries(usage.byKind).map(([kind, cost]) => (
              <span key={kind}>
                {KIND_LABEL[kind] ?? kind}: <span className="font-medium">{fmt(cost)}</span>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-neutral-400">
          Estimated from model/provider list prices. See{" "}
          <code>src/lib/ai/pricing.ts</code>.
        </p>
      </Card>
    </div>
  );
}
