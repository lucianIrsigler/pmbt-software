import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

// Placeholder until Phase 10 (admin dashboard).
export default async function AdminPage(): Promise<ReactNode> {
  const user = await requireUser();
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-2">Signed in as {user.email}. Stats and settings arrive in Phase 10.</p>
    </main>
  );
}
