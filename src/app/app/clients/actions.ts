"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/components/owner/field";
import { getDb } from "@/db";
import {
  archiveClient,
  archivePet,
  createClient,
  createPet,
  unarchiveClient,
  unarchivePet,
  updateClient,
  updateClientNotes,
  updatePet,
  updatePetNotes,
} from "@/domain/clients";
import { DomainError, PhoneInUseError } from "@/domain/errors";
import { ownerClientSchema, ownerPetSchema } from "@/domain/schemas";
import { requireUser } from "@/lib/auth";
import { sendBookingEmail } from "@/lib/booking-emails";
import { fieldErrors, text } from "@/lib/form-data";
import { logError, logInfo } from "@/lib/log";

export type ClientField = "name" | "phone" | "email";
export type PetField = "name" | "species" | "breed";
export interface ActionResult {
  error?: string;
}

const SOMETHING_WRONG = "Something went wrong. Please try again.";

function clientValues(formData: FormData): Record<ClientField, string> {
  return {
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  };
}

function petValues(formData: FormData): Record<PetField, string> {
  return {
    name: text(formData, "name"),
    species: text(formData, "species"),
    breed: text(formData, "breed"),
  };
}

/** Runs a button action: checks the session, maps errors to friendly text, refreshes. */
async function run(
  context: string,
  ids: Record<string, string>,
  fn: () => Promise<unknown>,
): Promise<ActionResult> {
  await requireUser();
  try {
    await fn();
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    logError(context, error, ids);
    return { error: SOMETHING_WRONG };
  }
  refresh();
  return {};
}

/** After the response, emails each client whose booking was cancelled by archiving. */
function emailCancellations(appointmentIds: string[]): void {
  if (appointmentIds.length === 0) return;
  after(async () => {
    for (const id of appointmentIds) await sendBookingEmail("cancellation", id);
  });
}

// --- Clients ---------------------------------------------------------------

export async function addClientAction(
  _prev: FormState<ClientField>,
  formData: FormData,
): Promise<FormState<ClientField>> {
  await requireUser();
  const values = clientValues(formData);
  const input = ownerClientSchema.safeParse(values);
  if (!input.success) return { values, errors: fieldErrors(input.error) };

  let result: { id: string; existing: boolean };
  try {
    result = await createClient(getDb(), input.data);
  } catch (error) {
    logError("clients.add", error);
    return { values, errors: {}, message: SOMETHING_WRONG };
  }
  logInfo("clients.added", { clientId: result.id });
  redirect(`/app/clients/${result.id}${result.existing ? "?existing=1" : ""}`);
}

export async function updateClientAction(
  clientId: string,
  _prev: FormState<ClientField>,
  formData: FormData,
): Promise<FormState<ClientField>> {
  await requireUser();
  const values = clientValues(formData);
  const input = ownerClientSchema.safeParse(values);
  if (!input.success) return { values, errors: fieldErrors(input.error) };

  try {
    await updateClient(getDb(), clientId, input.data);
  } catch (error) {
    if (error instanceof PhoneInUseError) {
      return { values, errors: { phone: error.message } };
    }
    if (error instanceof DomainError) return { values, errors: {}, message: error.message };
    logError("clients.update", error, { clientId });
    return { values, errors: {}, message: SOMETHING_WRONG };
  }
  redirect(`/app/clients/${clientId}?saved=1`);
}

/** Autosave: no refresh, so the text box isn't disturbed while she types. */
export async function saveClientNotesAction(
  clientId: string,
  notes: string,
): Promise<{ ok: boolean }> {
  await requireUser();
  try {
    await updateClientNotes(getDb(), { clientId, notes });
    return { ok: true };
  } catch (error) {
    logError("clients.save_notes", error, { clientId });
    return { ok: false };
  }
}

export async function archiveClientAction(clientId: string): Promise<ActionResult> {
  return run("clients.archive", { clientId }, async () => {
    const cancelled = await archiveClient(getDb(), clientId);
    logInfo("clients.archived", { clientId, cancelledBookings: String(cancelled.length) });
    emailCancellations(cancelled);
  });
}

export async function unarchiveClientAction(clientId: string): Promise<ActionResult> {
  return run("clients.unarchive", { clientId }, () => unarchiveClient(getDb(), clientId));
}

// --- Animals ---------------------------------------------------------------

export async function addPetAction(
  clientId: string,
  _prev: FormState<PetField>,
  formData: FormData,
): Promise<FormState<PetField>> {
  await requireUser();
  const values = petValues(formData);
  const input = ownerPetSchema.safeParse(values);
  if (!input.success) return { values, errors: fieldErrors(input.error) };

  try {
    await createPet(getDb(), clientId, input.data);
  } catch (error) {
    if (error instanceof DomainError) return { values, errors: {}, message: error.message };
    logError("pets.add", error, { clientId });
    return { values, errors: {}, message: SOMETHING_WRONG };
  }
  redirect(`/app/clients/${clientId}`);
}

export async function updatePetAction(
  clientId: string,
  petId: string,
  _prev: FormState<PetField>,
  formData: FormData,
): Promise<FormState<PetField>> {
  await requireUser();
  const values = petValues(formData);
  const input = ownerPetSchema.safeParse(values);
  if (!input.success) return { values, errors: fieldErrors(input.error) };

  try {
    await updatePet(getDb(), petId, input.data);
  } catch (error) {
    if (error instanceof DomainError) return { values, errors: {}, message: error.message };
    logError("pets.update", error, { clientId, petId });
    return { values, errors: {}, message: SOMETHING_WRONG };
  }
  redirect(`/app/clients/${clientId}?saved=1`);
}

export async function savePetNotesAction(petId: string, notes: string): Promise<{ ok: boolean }> {
  await requireUser();
  try {
    await updatePetNotes(getDb(), { petId, notes });
    return { ok: true };
  } catch (error) {
    logError("pets.save_notes", error, { petId });
    return { ok: false };
  }
}

export async function archivePetAction(petId: string): Promise<ActionResult> {
  return run("pets.archive", { petId }, async () => {
    const cancelled = await archivePet(getDb(), petId);
    logInfo("pets.archived", { petId, cancelledBookings: String(cancelled.length) });
    emailCancellations(cancelled);
  });
}

export async function unarchivePetAction(petId: string): Promise<ActionResult> {
  return run("pets.unarchive", { petId }, () => unarchivePet(getDb(), petId));
}
