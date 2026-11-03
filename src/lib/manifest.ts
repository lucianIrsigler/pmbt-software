import type { MetadataRoute } from "next";
import { BACKGROUND_COLOR, THEME_COLOR } from "./app-icon";

/** The installable icons, served by `src/app/icons/[file]/route.ts`. */
export const MANIFEST_ICONS = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
} as const;

export type ManifestIconFile = keyof typeof MANIFEST_ICONS;

export function isManifestIconFile(file: string): file is ManifestIconFile {
  return Object.hasOwn(MANIFEST_ICONS, file);
}

/**
 * The web app manifest for the owner's app. Opens straight into `/app`, full screen.
 * The scope is the whole site so that signing in again stays inside the app window.
 */
export function ownerAppManifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "My bookings",
    short_name: "My bookings",
    description: "Today's bookings, the calendar and clients.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: Object.entries(MANIFEST_ICONS).map(([file, icon]) => ({
      src: `/icons/${file}`,
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.maskable ? "maskable" : "any",
    })),
  };
}
