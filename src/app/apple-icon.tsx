import type { ImageResponse } from "next/og";
import { appIcon } from "@/lib/app-icon";

/** iPhone home-screen icon. iOS rounds the corners itself, so fill the square. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return appIcon(180, { maskable: true });
}
