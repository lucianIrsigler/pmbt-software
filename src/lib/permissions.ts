import { newEnforcer, newModelFromString, StringAdapter, type Enforcer } from "casbin";
import { userRole } from "@/db/schema";

/**
 * Who may open which part of the app, decided by Casbin (role-based access control).
 * Roles live on the `user` row; what each role may do lives here, in code, so a change
 * to access is always reviewed and deployed like any other change.
 */

export type Role = (typeof userRole.enumValues)[number];
export const ROLES: readonly Role[] = userRole.enumValues;

/** The protected parts of the app. */
export type Area = "app" | "admin";

const MODEL = `
[request_definition]
r = sub, obj

[policy_definition]
p = sub, obj

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj
`;

/**
 * - owner: the owner's app (/app)
 * - admin: stats and settings (/admin), and everything an owner can do
 */
const POLICY = `
p, owner, app
p, admin, admin
g, admin, owner
`;

let enforcer: Promise<Enforcer> | undefined;

function getEnforcer(): Promise<Enforcer> {
  enforcer ??= newEnforcer(newModelFromString(MODEL), new StringAdapter(POLICY));
  return enforcer;
}

/** Whether a login with `role` may open `area`. Unknown roles may open nothing. */
export async function can(role: string, area: Area): Promise<boolean> {
  if (!(ROLES as readonly string[]).includes(role)) return false;
  return (await getEnforcer()).enforce(role, area);
}
