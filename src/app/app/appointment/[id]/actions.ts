"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getDb } from "@/db";
import { undoStatus } from "@/domain/appointments";
import {
  addProductToAppointment,
  cancelByOwner,
  markDone,
  markNoShow,
  removeProductFromAppointment,
  updateAppointmentNotes,
} from "@/domain/booking";
import { DomainError } from "@/domain/errors";
import { requireUser } from "@/lib/auth";
import { sendBookingEmail } from "@/lib/booking-emails";
import { logError } from "@/lib/log";

/** Result shown by the button that triggered the action. */
export interface ActionResult {
  error?: string;
}

/**
 * Runs an owner action: checks the session (the proxy alone isn't enough), maps
 * domain errors to friendly text and refreshes the page on success.
 */
async function run(
  context: string,
  appointmentId: string,
  fn: () => Promise<unknown>,
): Promise<ActionResult> {
  await requireUser();
  try {
    await fn();
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    logError(context, error, { appointmentId });
    return { error: "Something went wrong. Please try again." };
  }
  refresh();
  return {};
}

export async function markDoneAction(id: string): Promise<ActionResult> {
  return run("appointment.done", id, () => markDone(getDb(), id));
}

export async function markNoShowAction(id: string): Promise<ActionResult> {
  return run("appointment.no_show", id, () => markNoShow(getDb(), id));
}

export async function undoStatusAction(id: string): Promise<ActionResult> {
  return run("appointment.undo", id, () => undoStatus(getDb(), id));
}

export async function cancelAppointmentAction(id: string): Promise<ActionResult> {
  return run("appointment.cancel_by_owner", id, async () => {
    await cancelByOwner(getDb(), id);
    after(() => sendBookingEmail("cancellation", id));
  });
}

export async function addProductAction(id: string, productId: string): Promise<ActionResult> {
  return run("appointment.add_product", id, () =>
    addProductToAppointment(getDb(), { appointmentId: id, productId }),
  );
}

export async function removeProductAction(id: string, productId: string): Promise<ActionResult> {
  return run("appointment.remove_product", id, () =>
    removeProductFromAppointment(getDb(), { appointmentId: id, productId }),
  );
}

/** Autosave: no page refresh, so the text box isn't disturbed while she types. */
export async function saveNotesAction(id: string, notes: string): Promise<{ ok: boolean }> {
  await requireUser();
  try {
    await updateAppointmentNotes(getDb(), { appointmentId: id, notes });
    return { ok: true };
  } catch (error) {
    logError("appointment.save_notes", error, { appointmentId: id });
    return { ok: false };
  }
}
