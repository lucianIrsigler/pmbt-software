import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BACKGROUND_COLOR } from "./brand";

/** The logo's width / height (from its viewBox). */
const LOGO_ASPECT = 114.974 / 99.368;

let logoDataUrl: string | undefined;

/**
 * `public/logo.svg` as a data URL for next/og. The icons are drawn at build time, when the
 * working directory is the project root.
 */
function logoSrc(): string {
  logoDataUrl ??= `data:image/svg+xml;base64,${readFileSync(
    join(process.cwd(), "public", "logo.svg"),
  ).toString("base64")}`;
  return logoDataUrl;
}

/**
 * The app icon: the logo heart on cream. `maskable` icons fill the whole square and keep
 * the heart inside the central safe zone (a circle 80% wide), because Android crops them
 * to a circle or squircle. Plain icons get rounded corners and a bigger heart.
 */
export function appIcon(size: number, { maskable = false } = {}): ImageResponse {
  const width = Math.round(size * (maskable ? 0.6 : 0.78));
  const height = Math.round(width / LOGO_ASPECT);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BACKGROUND_COLOR,
        borderRadius: maskable ? 0 : size * 0.22,
      }}
    >
      {/* next/og only draws plain <img>. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc()} width={width} height={height} alt="" />
    </div>,
    { width: size, height: size },
  );
}
