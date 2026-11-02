"use client";

import { useActionState, type ReactNode } from "react";
import { buttonPrimary, input, Notice } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }): ReactNode {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    email: "",
  });

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      {state.message && <Notice tone="error">{state.message}</Notice>}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-xl font-semibold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          required
          defaultValue={state.email}
          className={`${input} min-h-14 text-xl`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-xl font-semibold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`${input} min-h-14 text-xl`}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className={`${buttonPrimary} min-h-14 text-xl sm:w-full`}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
