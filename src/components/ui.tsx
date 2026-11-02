import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Shared class names. Buttons are at least 48px tall and full width on phones. */
export const buttonPrimary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-6 py-3 text-lg font-semibold text-white hover:bg-accent-strong disabled:opacity-60 sm:w-auto";
export const buttonSecondary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-accent bg-card px-6 py-3 text-lg font-semibold text-accent hover:bg-accent-soft sm:w-auto";
export const buttonDanger =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-danger px-6 py-3 text-lg font-semibold text-white hover:opacity-90 sm:w-auto";
export const card = "rounded-2xl border border-line bg-card p-5";
const inputBase =
  "block min-h-12 w-full rounded-xl border-2 bg-card px-4 py-2 text-lg text-ink placeholder:text-ink-soft";
export const input = `${inputBase} border-line focus:border-accent`;
export const inputInvalid = `${inputBase} border-danger`;

export function PageTitle({ children }: { children: ReactNode }): ReactNode {
  return <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{children}</h1>;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" }): ReactNode {
  const base = variant === "primary" ? buttonPrimary : buttonSecondary;
  return <Link className={`${base} ${className}`} {...props} />;
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: ReactNode;
}): ReactNode {
  const tones = {
    info: "border-line bg-card",
    success: "border-accent bg-accent-soft",
    warn: "border-warn-ink bg-warn-soft text-warn-ink",
    error: "border-danger bg-danger-soft text-danger",
  } as const;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border-2 p-4 ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
