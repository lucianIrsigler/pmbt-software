import { describe, expect, it } from "vitest";
import { chooseDelivery } from "./email";

describe("chooseDelivery", () => {
  it("sends over SMTP in production", () => {
    expect(chooseDelivery({ NODE_ENV: "production", EMAIL_OUTBOX_DIR: undefined })).toBe("smtp");
  });

  it("prints to the console in development and tests", () => {
    expect(chooseDelivery({ NODE_ENV: "development", EMAIL_OUTBOX_DIR: undefined })).toBe(
      "console",
    );
    expect(chooseDelivery({ NODE_ENV: "test", EMAIL_OUTBOX_DIR: undefined })).toBe("console");
  });

  it("writes to the outbox folder when one is set, even in production (e2e tests)", () => {
    expect(chooseDelivery({ NODE_ENV: "production", EMAIL_OUTBOX_DIR: "/tmp/outbox" })).toBe(
      "outbox",
    );
  });
});
