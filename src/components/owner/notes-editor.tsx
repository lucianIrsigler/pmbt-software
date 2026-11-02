"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

const STATUS_TEXT: Record<SaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved. Check your internet connection.",
};

/**
 * Large notes box that saves by itself shortly after she stops typing, when she
 * leaves the box, and when she switches away from the app. Shows a clear status.
 */
export function NotesEditor({
  label,
  initialNotes,
  save,
}: {
  label: string;
  initialNotes: string;
  save: (notes: string) => Promise<{ ok: boolean }>;
}): ReactNode {
  const [state, setState] = useState<SaveState>("idle");
  const value = useRef(initialNotes);
  const lastSaved = useRef(initialNotes);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);

  /** Saves until what's on screen matches what's saved (she may type during a save). */
  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    // A save loop is already running; it will pick up the latest text.
    if (inFlight.current) return inFlight.current;

    const loop = async (): Promise<void> => {
      let savedSomething = false;
      while (value.current !== lastSaved.current) {
        const text = value.current;
        setState("saving");
        const ok = await save(text).then(
          (result) => result.ok,
          () => false,
        );
        if (!ok) {
          setState("error");
          return;
        }
        lastSaved.current = text;
        savedSomething = true;
      }
      if (savedSomething) setState("saved");
    };

    inFlight.current = loop().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [save]);

  useEffect(() => {
    const onHide = (): void => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="visit-notes" className="text-2xl font-bold">
          {label}
        </label>
        <span
          role="status"
          aria-live="polite"
          className={`text-lg font-semibold ${state === "error" ? "text-danger" : "text-accent"}`}
        >
          {STATUS_TEXT[state]}
        </span>
      </div>
      <textarea
        id="visit-notes"
        defaultValue={initialNotes}
        rows={8}
        className="block w-full rounded-xl border-2 border-line bg-card p-4 text-xl leading-relaxed focus:border-accent"
        onChange={(e) => {
          value.current = e.target.value;
          setState("idle");
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
        }}
        onBlur={() => void flush()}
      />
    </div>
  );
}
