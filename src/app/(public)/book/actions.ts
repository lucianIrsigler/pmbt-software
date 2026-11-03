"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { loadActiveService } from "@/domain/availability";
import { createBooking } from "@/domain/booking";
import { DomainError, SlotTakenError, SlotUnavailableError } from "@/domain/errors";
import { idSchema, localDateSchema, newClientSchema, newPetSchema } from "@/domain/schemas";
import { sendBookingEmail } from "@/lib/booking-emails";
import { clientIp, ipKey } from "@/lib/client-ip";
import { getEnv } from "@/lib/env";
import { fieldErrors, text } from "@/lib/form-data";
import { logError, logInfo } from "@/lib/log";
import { BOOKING_RATE_LIMIT, consumeRateLimit } from "@/lib/rate-limit";
import { bookingStepUrl } from "./urls";

/** Public bookings: at most this many upcoming bookings per phone number. */
const MAX_UPCOMING_PER_PHONE = 2;

export type BookingField = "name" | "phone" | "email" | "petName" | "species" | "breed" | "consent";

export interface BookingFormState {
  /** What the visitor typed, so the form can be refilled after an error. */
  values: Partial<Record<BookingField, string>>;
  errors: Partial<Record<BookingField, string>>;
  message?: string;
}

const hiddenFields = z.object({
  serviceId: idSchema,
  date: localDateSchema,
  start: z.iso.datetime(),
});

export async function bookAction(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const values: BookingFormState["values"] = {
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    petName: text(formData, "petName"),
    species: text(formData, "species"),
    breed: text(formData, "breed"),
  };
  const fail = (message: string): BookingFormState => ({ values, errors: {}, message });

  // Honeypot: real people never see or fill this field.
  if (text(formData, "website") !== "") return fail("Something went wrong. Please try again.");

  const hidden = hiddenFields.safeParse({
    serviceId: text(formData, "serviceId"),
    date: text(formData, "date"),
    start: text(formData, "start"),
  });
  if (!hidden.success) return fail("Something went wrong. Please start your booking again.");
  const { serviceId, date, start } = hidden.data;

  const db = getDb();
  const env = getEnv();

  let forKind: "human" | "animal";
  try {
    forKind = (await loadActiveService(db, serviceId)).forKind;
  } catch {
    return fail("Sorry, that service is no longer available. Please choose another.");
  }

  const clientResult = newClientSchema.safeParse({
    name: values.name,
    phone: values.phone,
    email: values.email,
  });
  const petResult =
    forKind === "animal"
      ? newPetSchema.safeParse({
          name: values.petName,
          species: values.species,
          breed: values.breed,
        })
      : undefined;
  const errors: BookingFormState["errors"] = {
    ...(clientResult.success ? {} : fieldErrors<BookingField>(clientResult.error)),
    ...(petResult && !petResult.success
      ? fieldErrors<BookingField>(petResult.error, { name: "petName" })
      : {}),
    ...(formData.get("consent") === "on"
      ? {}
      : { consent: "Please tick the box to agree to the privacy notice" }),
  };
  if (!clientResult.success || (petResult && !petResult.success) || errors.consent) {
    return { values, errors };
  }

  const key = `booking:${ipKey(clientIp(await headers()), env.IP_HASH_SECRET)}`;
  const limit = await consumeRateLimit(db, key, BOOKING_RATE_LIMIT);
  if (!limit.allowed) {
    return fail(
      "You've made several bookings in a short time. Please try again later or phone us.",
    );
  }

  let token: string;
  try {
    const booking = await createBooking(
      db,
      {
        serviceId,
        start: new Date(start),
        client: clientResult.data,
        ...(petResult?.success ? { pet: petResult.data } : {}),
        source: "web",
      },
      { tz: env.BUSINESS_TZ, maxUpcomingPerClient: MAX_UPCOMING_PER_PHONE },
    );
    token = booking.manageToken;
    logInfo("booking.created", { appointmentId: booking.appointmentId });
    // After the response: a slow or failing mail server never affects the booking.
    after(() => sendBookingEmail("confirmation", booking.appointmentId));
  } catch (error) {
    if (error instanceof SlotTakenError || error instanceof SlotUnavailableError) {
      const reason = error instanceof SlotTakenError ? "taken" : "unavailable";
      redirect(bookingStepUrl({ service: serviceId, date, error: reason }));
    }
    if (error instanceof DomainError) return fail(error.message);
    logError("booking.create", error, { serviceId });
    return fail("Something went wrong. Please try again, or phone us to book.");
  }

  redirect(`/booking/${token}?new=1`);
}
