import { and, asc, count, desc, eq, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import { appointment, client, pet, service } from "@/db/schema";
import type { Queryable } from "./availability";
import { firstLine } from "./appointments";
import { NotFoundError, PhoneInUseError } from "./errors";
import {
  clientNotesSchema,
  clientSearchSchema,
  idSchema,
  ownerClientSchema,
  ownerPetSchema,
  petNotesSchema,
  type ClientNotesInput,
  type OwnerClientInput,
  type OwnerPetInput,
  type PetNotesInput,
} from "./schemas";

/** Finding and adding clients and their pets. */

type ClientRef = { id: string } | { name: string; phone: string; email?: string | undefined };
type PetRef = { id: string } | { name: string; species: string; breed?: string | undefined };

/** Finds the client by normalised phone (reusing archived ones) or creates them. */
export async function findOrCreateClient(tx: Transaction, ref: ClientRef): Promise<string> {
  if ("id" in ref) {
    const [row] = await tx
      .update(client)
      .set({ archivedAt: null })
      .where(eq(client.id, ref.id))
      .returning({ id: client.id });
    if (!row) throw new NotFoundError("client");
    return row.id;
  }

  // Serialise concurrent first bookings from the same phone so we don't create duplicates.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`client:${ref.phone}`}))`);

  const [existing] = await tx
    .select({ id: client.id, email: client.email })
    .from(client)
    .where(eq(client.phone, ref.phone))
    .orderBy(sql`${client.archivedAt} is not null`, desc(client.createdAt))
    .limit(1);

  if (existing) {
    // Keep the name the owner knows them by; only fill in a missing email.
    await tx
      .update(client)
      .set({ archivedAt: null, ...(existing.email ? {} : { email: ref.email ?? null }) })
      .where(eq(client.id, existing.id));
    return existing.id;
  }

  const [created] = await tx
    .insert(client)
    .values({ name: ref.name, phone: ref.phone, email: ref.email ?? null })
    .returning({ id: client.id });
  if (!created) throw new Error("client insert returned no row");
  return created.id;
}

/** Uses the given pet of this client, or reuses/creates one by name (case-insensitive). */
export async function findOrCreatePet(
  tx: Transaction,
  clientId: string,
  ref: PetRef,
): Promise<string> {
  if ("id" in ref) {
    const [row] = await tx
      .select({ id: pet.id })
      .from(pet)
      .where(and(eq(pet.id, ref.id), eq(pet.clientId, clientId)));
    if (!row) throw new NotFoundError("pet");
    return row.id;
  }

  const [existing] = await tx
    .select({ id: pet.id })
    .from(pet)
    .where(
      and(
        eq(pet.clientId, clientId),
        isNull(pet.archivedAt),
        sql`lower(${pet.name}) = lower(${ref.name})`,
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(pet)
    .values({ clientId, name: ref.name, species: ref.species, breed: ref.breed ?? null })
    .returning({ id: pet.id });
  if (!created) throw new Error("pet insert returned no row");
  return created.id;
}

/**
 * Adds a client entered by the owner. If someone already has that phone number,
 * returns them instead of creating a duplicate.
 */
export async function createClient(db: Database, rawInput: OwnerClientInput): Promise<string> {
  const input = ownerClientSchema.parse(rawInput);
  return db.transaction((tx) => findOrCreateClient(tx, input));
}

/** Adds a pet to a client (or returns their existing pet with that name). */
export async function createPet(
  db: Database,
  rawClientId: string,
  rawInput: OwnerPetInput,
): Promise<string> {
  const clientId = idSchema.parse(rawClientId);
  const input = ownerPetSchema.parse(rawInput);
  return db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: client.id }).from(client).where(eq(client.id, clientId));
    if (!owner) throw new NotFoundError("client");
    return findOrCreatePet(tx, clientId, input);
  });
}

export interface ClientSearchResult {
  id: string;
  name: string;
  phone: string;
  /** Names of their current pets, comma separated, to tell clients apart. */
  petNames: string;
}

const MAX_RESULTS = 20;

/**
 * A client's current pets' names, comma separated. Qualified by hand: Drizzle leaves
 * column names unqualified in a select list.
 */
const petNamesSql = sql<string>`coalesce((
  select string_agg(p.name, ', ' order by p.name) from pet p
  where p.client_id = "client"."id" and p.archived_at is null
), '')`;

/** Escapes `%`, `_` and `\` for use inside a LIKE pattern. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/**
 * Current (not archived) clients whose name contains `query`, or whose phone number
 * contains the digits typed (a leading 0 matches `+27…`). Needs at least 2 characters.
 */
export async function searchClients(
  db: Queryable,
  rawQuery: string,
): Promise<ClientSearchResult[]> {
  const query = clientSearchSchema.parse(rawQuery);
  if (query.length < 2) return [];

  const byName = sql`lower(${client.name}) like ${`%${escapeLike(query.toLowerCase())}%`}`;
  const digits = query.replace(/\D/g, "");
  const phoneDigits = digits.startsWith("0") ? digits.slice(1) : digits;
  const byPhone = phoneDigits.length >= 3 ? like(client.phone, `%${phoneDigits}%`) : undefined;

  return db
    .select({
      id: client.id,
      name: client.name,
      phone: client.phone,
      petNames: petNamesSql,
    })
    .from(client)
    .where(and(isNull(client.archivedAt), or(byName, byPhone)))
    .orderBy(asc(client.name))
    .limit(MAX_RESULTS);
}

export interface ClientPet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
}

export interface ClientWithPets {
  id: string;
  name: string;
  phone: string;
  pets: ClientPet[];
}

/** A client and their current pets, or null if there's no such client. */
export async function getClientWithPets(
  db: Queryable,
  rawId: string,
): Promise<ClientWithPets | null> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;
  const [row] = await db
    .select({ id: client.id, name: client.name, phone: client.phone })
    .from(client)
    .where(eq(client.id, id.data));
  if (!row) return null;
  const pets = await db
    .select({ id: pet.id, name: pet.name, species: pet.species, breed: pet.breed })
    .from(pet)
    .where(and(eq(pet.clientId, row.id), isNull(pet.archivedAt)))
    .orderBy(asc(pet.name));
  return { ...row, pets };
}

// ---------------------------------------------------------------------------
// Clients tab: list, profile, edits, archiving
// ---------------------------------------------------------------------------

const RECENT_CLIENTS = 20;

/** Current clients by most recent appointment (any status), then newest first. */
export async function listRecentClients(db: Queryable): Promise<ClientSearchResult[]> {
  return db
    .select({ id: client.id, name: client.name, phone: client.phone, petNames: petNamesSql })
    .from(client)
    .where(isNull(client.archivedAt))
    .orderBy(
      sql`(select max(lower(a.during)) from appointment a where a.client_id = "client"."id") desc nulls last`,
      desc(client.createdAt),
    )
    .limit(RECENT_CLIENTS);
}

export interface ClientProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string;
  archivedAt: Date | null;
  pets: ClientPet[];
  archivedPets: ClientPet[];
}

/** A client (archived or not) with their pets, or null. */
export async function getClientProfile(
  db: Queryable,
  rawId: string,
): Promise<ClientProfile | null> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;
  const [row] = await db
    .select({
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      notes: client.notes,
      archivedAt: client.archivedAt,
    })
    .from(client)
    .where(eq(client.id, id.data));
  if (!row) return null;
  const rows = await db
    .select({
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      archivedAt: pet.archivedAt,
    })
    .from(pet)
    .where(eq(pet.clientId, row.id))
    .orderBy(asc(pet.name));
  const toPet = (p: (typeof rows)[number]): ClientPet => ({
    id: p.id,
    name: p.name,
    species: p.species,
    breed: p.breed,
  });
  return {
    ...row,
    pets: rows.filter((p) => !p.archivedAt).map(toPet),
    archivedPets: rows.filter((p) => p.archivedAt).map(toPet),
  };
}

type AppointmentStatus = (typeof appointment.$inferSelect)["status"];

export interface ClientVisit {
  id: string;
  status: AppointmentStatus;
  start: Date;
  serviceName: string;
  petName: string | null;
  /** First line of the visit notes, or empty. */
  notesFirstLine: string;
}

export interface ClientVisits {
  /** Booked and not yet started, soonest first. */
  upcoming: ClientVisit[];
  /** Everything else (done, didn't come, cancelled, and past unmarked ones), newest first. */
  past: ClientVisit[];
}

/** All of a client's appointments, split into upcoming and past. */
export async function listClientVisits(
  db: Queryable,
  rawClientId: string,
  now: Date,
): Promise<ClientVisits> {
  const clientId = idSchema.parse(rawClientId);
  const rows = await db
    .select({
      id: appointment.id,
      status: appointment.status,
      during: appointment.during,
      serviceName: service.name,
      petName: pet.name,
      notes: appointment.notes,
    })
    .from(appointment)
    .innerJoin(service, eq(service.id, appointment.serviceId))
    .leftJoin(pet, eq(pet.id, appointment.petId))
    .where(eq(appointment.clientId, clientId))
    .orderBy(desc(sql`lower(${appointment.during})`));

  const visits = rows.map((r): ClientVisit => ({
    id: r.id,
    status: r.status,
    start: r.during.start,
    serviceName: r.serviceName,
    petName: r.petName,
    notesFirstLine: firstLine(r.notes),
  }));
  const isUpcoming = (v: ClientVisit): boolean =>
    v.status === "booked" && v.start.getTime() >= now.getTime();
  return {
    upcoming: visits.filter(isUpcoming).reverse(),
    past: visits.filter((v) => !isUpcoming(v)),
  };
}

/**
 * Changes a client's name, phone and email. Refuses a phone number that another
 * current (not archived) client already has, so bookings keep matching one person.
 */
export async function updateClient(
  db: Database,
  rawId: string,
  rawInput: OwnerClientInput,
): Promise<void> {
  const id = idSchema.parse(rawId);
  const input = ownerClientSchema.parse(rawInput);
  await db.transaction(async (tx) => {
    // Same lock as findOrCreateClient, so a booking can't take this number meanwhile.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`client:${input.phone}`}))`);
    const [other] = await tx
      .select({ id: client.id })
      .from(client)
      .where(and(eq(client.phone, input.phone), ne(client.id, id), isNull(client.archivedAt)))
      .limit(1);
    if (other) throw new PhoneInUseError();
    const updated = await tx
      .update(client)
      .set({ name: input.name, phone: input.phone, email: input.email ?? null })
      .where(eq(client.id, id))
      .returning({ id: client.id });
    if (updated.length === 0) throw new NotFoundError("client");
  });
}

export async function updateClientNotes(db: Database, rawInput: ClientNotesInput): Promise<void> {
  const input = clientNotesSchema.parse(rawInput);
  const updated = await db
    .update(client)
    .set({ notes: input.notes })
    .where(eq(client.id, input.clientId))
    .returning({ id: client.id });
  if (updated.length === 0) throw new NotFoundError("client");
}

/** Who an upcoming booking belongs to: a client, or one of their pets. */
type Owner = { clientId: string } | { petId: string };

function ownedBy(owner: Owner): SQL {
  return "clientId" in owner
    ? eq(appointment.clientId, owner.clientId)
    : eq(appointment.petId, owner.petId);
}

/** `booked` appointments of `owner` that haven't started yet. */
function upcomingBooked(owner: Owner, now: Date): SQL | undefined {
  return and(
    ownedBy(owner),
    eq(appointment.status, "booked"),
    sql`lower(${appointment.during}) >= ${now.toISOString()}::timestamptz`,
  );
}

/** How many upcoming bookings archiving this client or pet would cancel. */
export async function countUpcomingBookings(
  db: Queryable,
  owner: Owner,
  now: Date,
): Promise<number> {
  const [row] = await db.select({ n: count() }).from(appointment).where(upcomingBooked(owner, now));
  return row?.n ?? 0;
}

async function cancelUpcoming(tx: Transaction, owner: Owner, now: Date): Promise<number> {
  const cancelled = await tx
    .update(appointment)
    .set({ status: "cancelled", cancelledAt: now })
    .where(upcomingBooked(owner, now))
    .returning({ id: appointment.id });
  return cancelled.length;
}

/**
 * Archives a client (hidden from search and lists, never deleted) and cancels their
 * upcoming bookings. Returns how many bookings were cancelled.
 */
export async function archiveClient(
  db: Database,
  rawId: string,
  now: Date = new Date(),
): Promise<number> {
  const clientId = idSchema.parse(rawId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(client)
      .set({ archivedAt: now })
      .where(eq(client.id, clientId))
      .returning({ id: client.id });
    if (!row) throw new NotFoundError("client");
    return cancelUpcoming(tx, { clientId }, now);
  });
}

/** Brings an archived client back. Cancelled bookings stay cancelled. */
export async function unarchiveClient(db: Database, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  const updated = await db
    .update(client)
    .set({ archivedAt: null })
    .where(eq(client.id, id))
    .returning({ id: client.id });
  if (updated.length === 0) throw new NotFoundError("client");
}

export interface PetProfile extends ClientPet {
  clientId: string;
  clientName: string;
  notes: string;
  archivedAt: Date | null;
}

/** One of a client's pets (archived or not), or null. */
export async function getPet(
  db: Queryable,
  rawClientId: string,
  rawPetId: string,
): Promise<PetProfile | null> {
  const clientId = idSchema.safeParse(rawClientId);
  const petId = idSchema.safeParse(rawPetId);
  if (!clientId.success || !petId.success) return null;
  const [row] = await db
    .select({
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      notes: pet.notes,
      archivedAt: pet.archivedAt,
      clientId: pet.clientId,
      clientName: client.name,
    })
    .from(pet)
    .innerJoin(client, eq(client.id, pet.clientId))
    .where(and(eq(pet.id, petId.data), eq(pet.clientId, clientId.data)));
  return row ?? null;
}

export async function updatePet(
  db: Database,
  rawPetId: string,
  rawInput: OwnerPetInput,
): Promise<void> {
  const petId = idSchema.parse(rawPetId);
  const input = ownerPetSchema.parse(rawInput);
  const updated = await db
    .update(pet)
    .set({ name: input.name, species: input.species, breed: input.breed ?? null })
    .where(eq(pet.id, petId))
    .returning({ id: pet.id });
  if (updated.length === 0) throw new NotFoundError("pet");
}

export async function updatePetNotes(db: Database, rawInput: PetNotesInput): Promise<void> {
  const input = petNotesSchema.parse(rawInput);
  const updated = await db
    .update(pet)
    .set({ notes: input.notes })
    .where(eq(pet.id, input.petId))
    .returning({ id: pet.id });
  if (updated.length === 0) throw new NotFoundError("pet");
}

/**
 * Archives a pet (e.g. one that has passed away) and cancels its upcoming bookings.
 * Returns how many bookings were cancelled.
 */
export async function archivePet(
  db: Database,
  rawPetId: string,
  now: Date = new Date(),
): Promise<number> {
  const petId = idSchema.parse(rawPetId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(pet)
      .set({ archivedAt: now })
      .where(eq(pet.id, petId))
      .returning({ id: pet.id });
    if (!row) throw new NotFoundError("pet");
    return cancelUpcoming(tx, { petId }, now);
  });
}

export async function unarchivePet(db: Database, rawPetId: string): Promise<void> {
  const petId = idSchema.parse(rawPetId);
  const updated = await db
    .update(pet)
    .set({ archivedAt: null })
    .where(eq(pet.id, petId))
    .returning({ id: pet.id });
  if (updated.length === 0) throw new NotFoundError("pet");
}
