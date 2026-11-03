import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { listAllServices } from "@/domain/admin";
import { formatDuration, formatPrice } from "@/lib/format";
import { requestContext } from "@/lib/request";
import { adminButton } from "../components";

export const metadata: Metadata = { title: "Services" };

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { db } = await requestContext();
  const [services, params] = await Promise.all([listAllServices(db), searchParams]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Services</h1>
        <Link href="/admin/services/new" className={adminButton}>
          Add service
        </Link>
      </div>
      {params.saved === "1" && <Notice tone="success">Saved ✓</Notice>}
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead className="border-b-2 border-line">
            <tr>
              {["Name", "For", "Duration", "Buffer", "Price", "Order", "Status", ""].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-semibold">{s.name}</td>
                <td className="px-3 py-2">{s.forKind === "human" ? "People" : "Animals"}</td>
                <td className="px-3 py-2">{formatDuration(s.durationMin)}</td>
                <td className="px-3 py-2">{s.bufferMin} min</td>
                <td className="px-3 py-2 tabular-nums">{formatPrice(s.priceCents)}</td>
                <td className="px-3 py-2 tabular-nums">{s.sortOrder}</td>
                <td className="px-3 py-2">{s.active ? "Offered" : "Hidden"}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/services/${s.id}`}
                    className="text-accent underline"
                    aria-label={`Edit ${s.name}`}
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
