"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/components/owner/field";
import { getDb } from "@/db";
import { createBooking } from "@/domain/booking";
import { createClient, createPet } from "@/domain/clients";
import { SlotTakenError, SlotUnavailableError } from "@/domain/errors";
import { idSchema, ownerClientSchema, ownerPetSchema } from "@/domain/schemas";
import { localDateOf } from "@/domain/time";
import { requireUser } from "@/lib/auth";
import { sendBookingEmail } from "@/lib/booking-emails";
import { getEnv } from "@/lib/env";
import { fieldErrors, text } from "@/lib/form-data";
import { logError, logInfo } from "@/lib/log";
import { calendarUrl } from "../urls";
import { newBookingStepUrl } from "./urls";

export type ClientField = "name" | "phone";
export type PetField = "name" | "species" | "breed";

const SOMETHING_WRONG = "Something went wrong. Please try again.";

const startSchema = z.iso.datetime();

/** Step 1: a new client. If the phone number is already known, that client is used. */
export async function createClientAction(
  _prev: FormState<ClientField>,
  formData: FormData,
): Promise<FormState<ClientField>> {
  await requireUser();
  const values = { name: text(formData, "name"), phone: text(formData, "phone") };
  const start = startSchema.safeParse(text(formData, "start"));
  if (!start.success) return { values, errors: {}, message: SOMETHING_WRONG };

  const input = ownerClientSchema.safeParse(values);
  if (!input.success) return { values, errors: fieldErrors(input.error) };

  let clientId: string;
  try {
    clientId = (await createClient(getDb(), input.data)).id;
  } catch (error) {
    logError("calendar.create_client", error);
    return { values, errors: {}, message: SOMETHING_WRONG };
  }
  logInfo("calendar.client_ready", { clientId });
  redirect(newBookingStepUrl({ start: start.data, client: clientId }));
}

/** Step 2: a new pet for the chosen client. */
export async function createPetAction(
  _prev: FormState<PetField>,
  formData: FormData,
): Promise<FormState<PetField>> {
  await requireUser();
  const values = {
    name: text(formData, "name"),
    species: text(formData, "species"),
    breed: text(formData, "breed"),
  };
  const start = startSchema.safeParse(text(formData, "start"));
  const clientId = idSchema.safeParse(text(formData, "clientId"));
  if (!start.success || !clientId.success) return { values, errors: {}, message: SOMETHING_WRONG };

  const input = ownerPetSchema.safeParse(values);
  if (!input.success) return { values, errors: fieldErrors(input.error) };

  let petId: string;
  try {
    petId = await createPet(getDb(), clientId.data, input.data);
  } catch (error) {
    logError("calendar.create_pet", error, { clientId: clientId.data });
    return { values, errors: {}, message: SOMETHING_WRONG };
  }
  redirect(newBookingStepUrl({ start: start.data, client: clientId.data, pet: petId }));
}

const bookingFields = z.object({
  start: startSchema,
  clientId: idSchema,
  pet: z.union([z.literal("self"), idSchema]),
  serviceId: idSchema,
});

/** Step 4: book it. Owner bookings may be at short notice or further ahead than usual. */
export async function bookFromCalendarAction(formData: FormData): Promise<void> {
  await requireUser();
  const fields = bookingFields.safeParse({
    start: text(formData, "start"),
    clientId: text(formData, "clientId"),
    pet: text(formData, "pet"),
    serviceId: text(formData, "serviceId"),
  });
  if (!fields.success) redirect("/app/calendar");
  const { start, clientId, pet, serviceId } = fields.data;
  const tz = getEnv().BUSINESS_TZ;
  const date = localDateOf(new Date(start), tz);

  let outcome: string;
  try {
    const booking = await createBooking(
      getDb(),
      {
        serviceId,
        start: new Date(start),
        client: { id: clientId },
        ...(pet === "self" ? {} : { pet: { id: pet } }),
        source: "app",
      },
      { tz, ignoreMinNotice: true, ignoreHorizon: true },
    );
    logInfo("calendar.booked", { appointmentId: booking.appointmentId });
    after(() => sendBookingEmail("confirmation", booking.appointmentId));
    outcome = calendarUrl(date, { booked: true });
  } catch (error) {
    if (error instanceof SlotTakenError) outcome = calendarUrl(date, { error: "taken" });
    else if (error instanceof SlotUnavailableError) {
      outcome = calendarUrl(date, { error: "unavailable" });
    } else {
      logError("calendar.book", error, { clientId, serviceId });
      outcome = newBookingStepUrl({
        start,
        client: clientId,
        pet,
        service: serviceId,
        error: "failed",
      });
    }
  }
  redirect(outcome);
}
