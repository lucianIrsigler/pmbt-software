import { describe, expect, it } from "vitest";
import { can, ROLES } from "./permissions";

describe("can", () => {
  it("lets the owner use her app but not admin", async () => {
    expect(await can("owner", "app")).toBe(true);
    expect(await can("owner", "admin")).toBe(false);
  });

  it("lets an admin use both", async () => {
    expect(await can("admin", "app")).toBe(true);
    expect(await can("admin", "admin")).toBe(true);
  });

  it("refuses unknown roles", async () => {
    expect(await can("", "app")).toBe(false);
    expect(await can("receptionist", "app")).toBe(false);
    expect(await can("Admin", "admin")).toBe(false);
  });

  it("knows exactly the database's roles", () => {
    expect(ROLES).toEqual(["owner", "admin"]);
  });
});
