"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/db";
import { cancelBookingByToken } from "@/domain/booking";
import { CancelTooLateError, NotFoundError } from "@/domain/errors";
import { sendBookingEmail } from "@/lib/booking-emails";
import { logError, logInfo } from "@/lib/log";

/** Client cancels via their private link (bound to the token). */
export async function cancelBookingAction(token: string): Promise<void> {
  let target = `/booking/${token}?cancelled=1`;
  try {
    const result = await cancelBookingByToken(getDb(), token);
    if (!result.alreadyCancelled) {
      logInfo("booking.cancelled_by_client", { appointmentId: result.appointmentId });
      after(() => sendBookingEmail("cancellation", result.appointmentId));
    }
  } catch (error) {
    if (error instanceof CancelTooLateError) target = `/booking/${token}?error=too-late`;
    else if (error instanceof NotFoundError) target = `/booking/${token}`;
    else {
      logError("booking.cancel_by_token", error);
      target = `/booking/${token}?error=failed`;
    }
  }
  redirect(target);
}
