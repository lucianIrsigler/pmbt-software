import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ownerBackLink } from "@/components/owner/styles";

export const metadata: Metadata = { title: "Install the app" };

interface Step {
  text: ReactNode;
  /** What the screenshot placeholder should show, until real screenshots are added. */
  screenshot: string;
}

const ANDROID: Step[] = [
  { text: "Open this app in Chrome.", screenshot: "Chrome showing the Today screen" },
  {
    text: (
      <>
        Tap the <strong>three dots</strong> at the top right of the screen.
      </>
    ),
    screenshot: "The three dots menu button in Chrome",
  },
  {
    text: (
      <>
        Tap <strong>Add to Home screen</strong> (it may say <strong>Install app</strong>).
      </>
    ),
    screenshot: "The Add to Home screen option in the menu",
  },
  {
    text: (
      <>
        Tap <strong>Install</strong> or <strong>Add</strong>.
      </>
    ),
    screenshot: "The Install confirmation",
  },
];

const IPHONE: Step[] = [
  { text: "Open this app in Safari.", screenshot: "Safari showing the Today screen" },
  {
    text: (
      <>
        Tap the <strong>Share</strong> button (a square with an arrow pointing up) at the bottom of
        the screen.
      </>
    ),
    screenshot: "The Share button in Safari",
  },
  {
    text: (
      <>
        Scroll down and tap <strong>Add to Home Screen</strong>.
      </>
    ),
    screenshot: "The Add to Home Screen option",
  },
  {
    text: (
      <>
        Tap <strong>Add</strong> at the top right.
      </>
    ),
    screenshot: "The Add button",
  },
];

function Steps({ id, title, steps }: { id: string; title: string; steps: Step[] }): ReactNode {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-2xl font-bold">
        {title}
      </h2>
      <ol className="flex flex-col gap-4">
        {steps.map((step, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-card p-4">
            <p className="text-xl">
              <strong>{i + 1}.</strong> {step.text}
            </p>
            {/* TODO(owner): replace with a real screenshot. */}
            <div className="flex min-h-32 items-center justify-center rounded-xl border-2 border-dashed border-ink-soft bg-page p-3 text-center text-lg text-ink-soft">
              Screenshot to come: {step.screenshot}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** How to put the app on her phone's home screen. Linked from Settings. */
export default function HelpPage(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/settings" className={ownerBackLink}>
        ← Settings
      </Link>
      <h1 className="text-3xl font-bold">Put the app on your home screen</h1>
      <p className="text-xl">
        Then you can open <strong>My bookings</strong> with one tap, like any other app. You only
        need to do this once.
      </p>
      <Steps id="android-heading" title="Android phone" steps={ANDROID} />
      <Steps id="iphone-heading" title="iPhone" steps={IPHONE} />
      <p className="text-xl">
        Afterwards, look for the green <strong>B</strong> icon called <strong>My bookings</strong>{" "}
        on your home screen.
      </p>
    </div>
  );
}
