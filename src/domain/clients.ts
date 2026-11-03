import { and, asc, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import { client, pet } from "@/db/schema";
import type { Queryable } from "./availability";
import { NotFoundError } from "./errors";
import {
  clientSearchSchema,
  idSchema,
  ownerClientSchema,
  ownerPetSchema,
  type OwnerClientInput,
  type OwnerPetInput,
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
      // Qualified by hand: Drizzle leaves column names unqualified in a select list.
      petNames: sql<string>`coalesce((
        select string_agg(p.name, ', ' order by p.name) from pet p
        where p.client_id = "client"."id" and p.archived_at is null
      ), '')`,
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
