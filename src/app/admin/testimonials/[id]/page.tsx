import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getTestimonial } from "@/domain/admin";
import { adminContext } from "@/app/admin/context";
import { saveTestimonialAction } from "../../actions";
import { AdminForm } from "../../admin-form";
import { TESTIMONIAL_FIELDS } from "../../fields";

export const metadata: Metadata = { title: "Testimonial" };

const NEW_TESTIMONIAL = { quote: "", author: "", sortOrder: "0", active: "on" };

/** `/admin/testimonials/new` adds a testimonial; `/admin/testimonials/<id>` edits one. */
export default async function AdminTestimonialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const { db } = await adminContext();
  const isNew = id === "new";
  let initial: Record<string, string> = NEW_TESTIMONIAL;
  if (!isNew) {
    const t = await getTestimonial(db, id);
    if (!t) notFound();
    initial = {
      quote: t.quote,
      author: t.author,
      sortOrder: String(t.sortOrder),
      active: t.active ? "on" : "",
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/testimonials" className="self-start text-accent underline">
        ← Testimonials
      </Link>
      <h1 className="text-3xl font-bold">
        {isNew ? "Add testimonial" : `Edit testimonial from ${initial.author}`}
      </h1>
      <AdminForm
        action={saveTestimonialAction.bind(null, isNew ? null : id)}
        fields={TESTIMONIAL_FIELDS}
        initial={initial}
        submitLabel={isNew ? "Add testimonial" : "Save changes"}
      />
    </div>
  );
}
