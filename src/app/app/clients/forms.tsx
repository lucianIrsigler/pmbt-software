"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { ownerButton, ownerInput } from "@/components/owner/styles";

/** Search that updates the results as she types; the button works without JavaScript. */
export function ClientSearchBox({ initial }: { initial: string }): ReactNode {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <form action="/app/clients" role="search" className="flex flex-col gap-3">
      <label htmlFor="client-search" className="text-xl font-semibold">
        Find a client by name or phone
      </label>
      <input
        id="client-search"
        name="q"
        type="search"
        defaultValue={initial}
        autoComplete="off"
        className={ownerInput}
        onChange={(e) => {
          const q = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            router.replace(q ? `/app/clients?q=${encodeURIComponent(q)}` : "/app/clients");
          }, 300);
        }}
      />
      <button type="submit" className={ownerButton.secondary}>
        Search
      </button>
    </form>
  );
}
