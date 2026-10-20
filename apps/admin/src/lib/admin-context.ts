import { createContext, useContext } from "react";

import type { Admin, AdminRole } from "@/lib/types";

// The context lives apart from <AuthGate> so editing the gate (or anything it imports) during development
// can't hot-reload a second copy of the context that already-mounted pages no longer see.

/** Provided by <AuthGate>; exported so tests and previews can supply an admin without signing in. */
export const AdminContext = createContext<Admin | null>(null);

/** The signed-in platform admin. Only valid inside <AuthGate>. */
export function useAdmin() {
  const admin = useContext(AdminContext);
  if (!admin) throw new Error("useAdmin must be used inside <AuthGate>");
  return admin;
}

const rank: Record<AdminRole, number> = { read_only: 1, support: 2, super_admin: 3 };

/** Mirrors admin.Role.Allows on the server. The server enforces it; this only hides controls. */
export function useCan(minimum: AdminRole) {
  return rank[useAdmin().role] >= rank[minimum];
}
