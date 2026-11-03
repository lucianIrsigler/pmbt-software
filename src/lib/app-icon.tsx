import { ImageResponse } from "next/og";

/**
 * Placeholder app icon: a white "B" on the app's green. Replace with the real logo
 * later (see docs/IMPROVEMENTS.md); the manifest only needs the icon URLs to stay.
 */

export const THEME_COLOR = "#1f5f4a";
export const BACKGROUND_COLOR = "#fdf8f1";

/**
 * `maskable` icons fill the whole square and keep the letter inside the central safe
 * zone, because Android crops them to a circle or squircle. Plain icons get rounded
 * corners and a bigger letter.
 */
export function appIcon(size: number, { maskable = false } = {}): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: THEME_COLOR,
        borderRadius: maskable ? 0 : size * 0.22,
        color: "white",
        fontSize: size * (maskable ? 0.5 : 0.62),
        fontWeight: 700,
      }}
    >
      B
    </div>,
    { width: size, height: size },
  );
}
