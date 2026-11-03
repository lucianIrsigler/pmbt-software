/** The admin login created for e2e runs (see global-setup.ts): it opens the app and admin. */
export const E2E_USER = {
  email: "owner@example.com",
  name: "E2E Owner",
  password: "e2e password 123",
  role: "admin",
} as const;

/** A login with the owner role: her app only. */
export const E2E_OWNER_ONLY = {
  email: "owner-only@example.com",
  name: "E2E Owner Only",
  password: "e2e password 456",
  role: "owner",
} as const;
