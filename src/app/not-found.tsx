import Link from "next/link";
import type { ReactNode } from "react";

export default function NotFound(): ReactNode {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-lg">
        We couldn&apos;t find that page. If you followed a booking link, please check it was copied
        in full.
      </p>
      <p>
        <Link href="/" className="text-lg font-semibold text-accent underline">
          Go to the home page
        </Link>
      </p>
    </main>
  );
}
