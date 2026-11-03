import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { appointment, appointmentProduct, product } from "@/db/schema";
import { InvalidStatusError, NotFoundError } from "./errors";
import {
  addProductSchema,
  removeProductSchema,
  type AddProductInput,
  type RemoveProductInput,
} from "./schemas";

/** Products sold during a session, at the price on the day. */

export interface AppointmentProductLine {
  productId: string;
  qty: number;
  priceCents: number;
}

/**
 * Records a product sold during an appointment, at its current price.
 * Adding the same product again increases the quantity (keeping the first price).
 */
export async function addProductToAppointment(
  db: Database,
  rawInput: AddProductInput,
): Promise<AppointmentProductLine> {
  const input = addProductSchema.parse(rawInput);
  return db.transaction(async (tx) => {
    const [appt] = await tx
      .select({ status: appointment.status })
      .from(appointment)
      .where(eq(appointment.id, input.appointmentId));
    if (!appt) throw new NotFoundError("appointment");
    if (appt.status === "cancelled") throw new InvalidStatusError(appt.status, "given products");

    const [prod] = await tx
      .select({ priceCents: product.priceCents, active: product.active })
      .from(product)
      .where(eq(product.id, input.productId));
    if (!prod || !prod.active) throw new NotFoundError("product");

    const [line] = await tx
      .insert(appointmentProduct)
      .values({
        appointmentId: input.appointmentId,
        productId: input.productId,
        qty: input.qty,
        priceCents: prod.priceCents,
      })
      .onConflictDoUpdate({
        target: [appointmentProduct.appointmentId, appointmentProduct.productId],
        set: { qty: sql`${appointmentProduct.qty} + excluded.qty` },
      })
      .returning({
        productId: appointmentProduct.productId,
        qty: appointmentProduct.qty,
        priceCents: appointmentProduct.priceCents,
      });
    if (!line) throw new Error("appointment_product upsert returned no row");
    return line;
  });
}

/** Removes a product line from an appointment. Returns false if it wasn't there. */
export async function removeProductFromAppointment(
  db: Database,
  rawInput: RemoveProductInput,
): Promise<boolean> {
  const input = removeProductSchema.parse(rawInput);
  const removed = await db
    .delete(appointmentProduct)
    .where(
      and(
        eq(appointmentProduct.appointmentId, input.appointmentId),
        eq(appointmentProduct.productId, input.productId),
      ),
    )
    .returning({ productId: appointmentProduct.productId });
  return removed.length > 0;
}
