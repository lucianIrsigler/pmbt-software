"use server";

import { after } from "next/server";
import { getDb } from "@/db";
import { addProductToAppointment, removeProductFromAppointment } from "@/domain/booking-products";
import {
  cancelByOwner,
  markDone,
  markNoShow,
  undoStatus,
  updateAppointmentNotes,
} from "@/domain/booking-status";
import { requireUser } from "@/lib/auth";
import { sendBookingEmail } from "@/lib/booking-emails";
import { logError } from "@/lib/log";
import { runOwnerAction, type ActionResult } from "@/lib/owner-action";

export async function markDoneAction(id: string): Promise<ActionResult> {
  return runOwnerAction("appointment.done", { appointmentId: id }, () => markDone(getDb(), id));
}

export async function markNoShowAction(id: string): Promise<ActionResult> {
  return runOwnerAction("appointment.no_show", { appointmentId: id }, () =>
    markNoShow(getDb(), id),
  );
}

export async function undoStatusAction(id: string): Promise<ActionResult> {
  return runOwnerAction("appointment.undo", { appointmentId: id }, () => undoStatus(getDb(), id));
}

export async function cancelAppointmentAction(id: string): Promise<ActionResult> {
  return runOwnerAction("appointment.cancel_by_owner", { appointmentId: id }, async () => {
    await cancelByOwner(getDb(), id);
    after(() => sendBookingEmail("cancellation", id));
  });
}

export async function addProductAction(id: string, productId: string): Promise<ActionResult> {
  return runOwnerAction("appointment.add_product", { appointmentId: id }, () =>
    addProductToAppointment(getDb(), { appointmentId: id, productId }),
  );
}

export async function removeProductAction(id: string, productId: string): Promise<ActionResult> {
  return runOwnerAction("appointment.remove_product", { appointmentId: id }, () =>
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
