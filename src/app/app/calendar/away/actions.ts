"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/owner/field";
import { getDb } from "@/db";
import { DomainError } from "@/domain/errors";
import { addTimeOffSchema } from "@/domain/schemas";
import { addTimeOff, removeTimeOff } from "@/domain/time-off";
import { requireUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { logError, logInfo } from "@/lib/log";

export type AwayField = "date" | "kind" | "startTime" | "endTime" | "reason";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Blocks a whole day or part of one, then shows the result (and any clashing bookings). */
export async function addTimeOffAction(
  _prev: FormState<AwayField>,
  formData: FormData,
): Promise<FormState<AwayField>> {
  await requireUser();
  const values = {
    date: text(formData, "date"),
    kind: text(formData, "kind"),
    startTime: text(formData, "startTime"),
    endTime: text(formData, "endTime"),
    reason: text(formData, "reason"),
  };
  const parsed = addTimeOffSchema.safeParse(values);
  if (!parsed.success) {
    const errors: FormState<AwayField>["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "date") as AwayField;
      errors[key] ??= issue.message;
    }
    return { values, errors };
  }

  let id: string;
  try {
    id = await addTimeOff(getDb(), parsed.data, { tz: getEnv().BUSINESS_TZ });
  } catch (error) {
    if (error instanceof DomainError) return { values, errors: {}, message: error.message };
    logError("time_off.add", error);
    return { values, errors: {}, message: "Something went wrong. Please try again." };
  }
  logInfo("time_off.added", { timeOffId: id });
  redirect(`/app/calendar/away?added=${id}`);
}

export async function removeTimeOffAction(id: string): Promise<{ error?: string }> {
  await requireUser();
  try {
    await removeTimeOff(getDb(), id);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    logError("time_off.remove", error, { timeOffId: id });
    return { error: "Something went wrong. Please try again." };
  }
  refresh();
  return {};
}
