import { eq } from "drizzle-orm";
import { appointment, client, pet, service } from "@/db/schema";
import { loadSettings, type Queryable } from "./availability";
import { cancelDeadline } from "./booking";
import { addMinutesTo } from "./time";

/** Everything an email about one appointment needs. */
export interface AppointmentEmailData {
  appointmentId: string;
  status: (typeof appointment.$inferSelect)["status"];
  clientName: string;
  /** Null when the client gave no email address: nothing is sent. */
  clientEmail: string | null;
  serviceName: string;
  priceCents: number;
  petName: string | null;
  /** Session start and end, without the buffer. */
  start: Date;
  end: Date;
  manageToken: string;
  cancelDeadline: Date;
  business: { name: string; phone: string | null; email: string | null; address: string | null };
}

export async function getAppointmentEmailData(
  db: Queryable,
  appointmentId: string,
): Promise<AppointmentEmailData | null> {
  const [row] = await db
    .select({
      appointmentId: appointment.id,
      status: appointment.status,
      during: appointment.during,
      createdAt: appointment.createdAt,
      manageToken: appointment.manageToken,
      clientName: client.name,
      clientEmail: client.email,
      serviceName: service.name,
      priceCents: service.priceCents,
      durationMin: service.durationMin,
      petName: pet.name,
    })
    .from(appointment)
    .innerJoin(service, eq(service.id, appointment.serviceId))
    .innerJoin(client, eq(client.id, appointment.clientId))
    .leftJoin(pet, eq(pet.id, appointment.petId))
    .where(eq(appointment.id, appointmentId));
  if (!row) return null;

  const settings = await loadSettings(db);
  const { during, createdAt, durationMin, ...rest } = row;
  return {
    ...rest,
    start: during.start,
    end: addMinutesTo(during.start, durationMin),
    cancelDeadline: cancelDeadline(during.start, createdAt, settings.cancelCutoffHours),
    business: {
      name: settings.businessName,
      phone: settings.contactPhone,
      email: settings.contactEmail,
      address: settings.address,
    },
  };
}
