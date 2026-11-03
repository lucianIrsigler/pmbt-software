import { describe, expect, it } from "vitest";
import { isManifestIconFile, ownerAppManifest } from "./manifest";

describe("ownerAppManifest", () => {
  const manifest = ownerAppManifest();

  it("opens the owner's app full screen", () => {
    expect(manifest).toMatchObject({
      name: "My bookings",
      short_name: "My bookings",
      start_url: "/app",
      display: "standalone",
      theme_color: "#1f5f4a",
    });
    expect((manifest.short_name ?? "").length).toBeLessThanOrEqual(12);
  });

  it("has the icons browsers need to install it", () => {
    const icons = manifest.icons ?? [];
    expect(icons.map((i) => [i.sizes, i.purpose])).toEqual([
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ]);
    for (const icon of icons) {
      expect(icon.type).toBe("image/png");
      expect(isManifestIconFile(icon.src.replace("/icons/", ""))).toBe(true);
    }
  });

  it("only serves known icon files", () => {
    expect(isManifestIconFile("icon-192.png")).toBe(true);
    expect(isManifestIconFile("../secret")).toBe(false);
    expect(isManifestIconFile("toString")).toBe(false);
  });
});
