import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { loadSettings } from "@/domain/availability";
import { adminContext } from "@/app/admin/context";
import type { SearchParams } from "@/lib/search-params";
import { saveSettingsAction } from "../actions";
import { AdminForm } from "../admin-form";
import { SETTINGS_FIELDS } from "../fields";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db } = await adminContext();
  const [s, params] = await Promise.all([loadSettings(db), searchParams]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="max-w-xl text-ink-soft">
        The business details appear on the website and in emails. The booking rules apply to online
        bookings; the owner can book outside them in her calendar.
      </p>
      {params.saved === "1" && <Notice tone="success">Saved ✓</Notice>}
      <AdminForm
        action={saveSettingsAction}
        fields={SETTINGS_FIELDS}
        initial={{
          businessName: s.businessName,
          contactPhone: s.contactPhone ?? "",
          contactEmail: s.contactEmail ?? "",
          address: s.address ?? "",
          minNoticeHours: String(s.minNoticeHours),
          maxDaysAhead: String(s.maxDaysAhead),
          slotStepMin: String(s.slotStepMin),
          cancelCutoffHours: String(s.cancelCutoffHours),
        }}
        submitLabel="Save settings"
      />
    </div>
  );
}
