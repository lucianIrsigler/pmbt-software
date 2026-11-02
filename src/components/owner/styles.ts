/**
 * Owner-app button styles: at least 56px tall, full width, large text.
 * Kept out of "use client" files so server components can use them too.
 */
export const ownerButton = {
  primary:
    "flex min-h-14 w-full items-center justify-center rounded-xl bg-accent px-5 text-xl font-bold text-white hover:bg-accent-strong disabled:opacity-60",
  secondary:
    "flex min-h-14 w-full items-center justify-center rounded-xl border-2 border-accent bg-card px-5 text-xl font-bold text-accent hover:bg-accent-soft disabled:opacity-60",
  danger:
    "flex min-h-14 w-full items-center justify-center rounded-xl bg-danger px-5 text-xl font-bold text-white hover:opacity-90 disabled:opacity-60",
  small:
    "flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-line bg-card px-4 text-lg font-semibold text-ink hover:border-danger hover:text-danger",
} as const;
