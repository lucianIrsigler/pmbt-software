import Link from "next/link";
import type { ReactNode } from "react";
import { ownerBackLink } from "./owner/styles";
import { PageTitle } from "./ui";

/** Both booking flows have four steps: the public one and the owner's from the calendar. */
const STEPS = 4;

const styles = {
  /** The public site: the step title is the page heading. */
  public: {
    wrapper: "flex flex-col gap-5",
    header: "flex flex-col gap-1",
    counter: "font-semibold text-ink-soft",
    back: "inline-block py-2 font-semibold text-accent underline underline-offset-4",
  },
  /** The owner's app: under the page's own "New booking" heading, larger text. */
  owner: {
    wrapper: "flex flex-col gap-4",
    header: undefined,
    counter: "text-lg font-semibold text-ink-soft",
    back: ownerBackLink,
  },
} as const;

/** One step of a multi-step booking flow: "Step n of 4", its title and a back link. */
export function Step({
  variant,
  n,
  title,
  back,
  children,
}: {
  variant: keyof typeof styles;
  n: number;
  title: string;
  back?: { href: string; label: string } | undefined;
  children: ReactNode;
}): ReactNode {
  const style = styles[variant];
  const Wrapper = variant === "owner" ? "section" : "div";
  return (
    <Wrapper className={style.wrapper}>
      <div className={style.header}>
        <p className={style.counter}>
          Step {n} of {STEPS}
        </p>
        {variant === "owner" ? (
          <h2 className="text-2xl font-bold">{title}</h2>
        ) : (
          <PageTitle>{title}</PageTitle>
        )}
      </div>
      {back && (
        <Link href={back.href} className={style.back}>
          ← {back.label}
        </Link>
      )}
      {children}
    </Wrapper>
  );
}
