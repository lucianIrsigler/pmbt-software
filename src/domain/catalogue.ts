import { and, asc, eq } from "drizzle-orm";
import { product, service } from "@/db/schema";
import { loadSettings, type Queryable, type Service } from "./availability";

export type Product = typeof product.$inferSelect;

/** Active services in display order, optionally only those for humans or animals. */
export async function listActiveServices(
  db: Queryable,
  forKind?: Service["forKind"],
): Promise<Service[]> {
  return db
    .select()
    .from(service)
    .where(and(eq(service.active, true), forKind ? eq(service.forKind, forKind) : undefined))
    .orderBy(asc(service.sortOrder), asc(service.name));
}

export async function listActiveProducts(db: Queryable): Promise<Product[]> {
  return db
    .select()
    .from(product)
    .where(eq(product.active, true))
    .orderBy(asc(product.sortOrder), asc(product.name));
}

export interface PublicSettings {
  businessName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
}

/** Business details safe to show on the public site. */
export async function getPublicSettings(db: Queryable): Promise<PublicSettings> {
  const s = await loadSettings(db);
  return {
    businessName: s.businessName,
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    address: s.address,
  };
}
