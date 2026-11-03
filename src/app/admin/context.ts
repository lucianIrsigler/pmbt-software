import "server-only";
import { requireAccess } from "@/lib/auth";
import { requestContext, type RequestContext } from "@/lib/request";

/**
 * `requestContext()` for admin pages, after checking the login may open admin. Every
 * admin page calls this: the layout's check doesn't run again on client-side navigation.
 */
export async function adminContext(): Promise<RequestContext> {
  await requireAccess("admin");
  return requestContext();
}
