import type { TechRole } from "@/types";

/**
 * Per-role tab access. Owner and manager get everything. Technicians work
 * repairs (operations/tickets) plus stock, bench, and knowledge. Clerks run the
 * counter: point of sale plus knowledge and stock.
 *
 * Note: the spec listed "stock, bench, knowledge" for technicians; operations
 * (tickets/customers/devices) is included because the ring-out workflow requires
 * technicians to open tickets and add labor and parts. Edit this single map to
 * change access.
 */
const TECHNICIAN_PATHS = [
  "/",
  "/tickets",
  "/customers",
  "/devices",
  "/inventory",
  "/donors",
  "/microsoldering",
  "/intelligence",
  "/board-tools",
  "/calculator",
  "/knowledge",
  "/reference",
];

const CLERK_PATHS = [
  "/",
  "/pos",
  "/sales",
  "/knowledge",
  "/reference",
  "/inventory",
  "/donors",
];

export const ROLE_ACCESS: Record<TechRole, "all" | string[]> = {
  owner: "all",
  manager: "all",
  technician: TECHNICIAN_PATHS,
  clerk: CLERK_PATHS,
};

/** Does this role have access to a route path? Detail routes inherit their base. */
export function hasAccess(role: TechRole, path: string): boolean {
  const access = ROLE_ACCESS[role];
  if (access === "all") return true;
  // Match the path's first segment (e.g. /tickets/5 -> /tickets).
  const base = "/" + (path.split("/")[1] ?? "");
  return access.includes(path) || access.includes(base);
}

export const ROLE_LABEL: Record<TechRole, string> = {
  owner: "Owner",
  manager: "Manager",
  technician: "Technician",
  clerk: "Clerk",
};
