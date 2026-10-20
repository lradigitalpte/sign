// The workspace the user is working in is stored in a cookie so both browser requests and
// Next.js route handlers (file downloads) can send it to the API as X-Workspace-ID.
export const WORKSPACE_COOKIE = "sp_workspace";
export const WORKSPACE_HEADER = "X-Workspace-ID";

export function getActiveWorkspaceId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${WORKSPACE_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(WORKSPACE_COOKIE.length + 1)) || undefined : undefined;
}

export function setActiveWorkspaceId(id: string | undefined) {
  if (typeof document === "undefined") return;
  if (!id) {
    document.cookie = `${WORKSPACE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${WORKSPACE_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

// The team within the workspace (teams own envelopes, templates and folders), stored the same way and
// sent as X-Team-ID. Without it the API uses the workspace's default team.
export const TEAM_COOKIE = "sp_team";
export const TEAM_HEADER = "X-Team-ID";

export function getActiveTeamId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${TEAM_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(TEAM_COOKIE.length + 1)) || undefined : undefined;
}

export function setActiveTeamId(id: string | undefined) {
  if (typeof document === "undefined") return;
  if (!id) {
    document.cookie = `${TEAM_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${TEAM_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** Headers to add to direct fetch() calls against the platform API from the browser. */
export function workspaceHeaders(): Record<string, string> {
  const id = getActiveWorkspaceId();
  const team = getActiveTeamId();
  return { ...(id ? { [WORKSPACE_HEADER]: id } : {}), ...(team ? { [TEAM_HEADER]: team } : {}) };
}

/** Headers for a Next.js route handler forwarding a request to the platform API. */
export function workspaceHeadersFromCookie(cookies: { get(name: string): { value: string } | undefined }): Record<string, string> {
  const id = cookies.get(WORKSPACE_COOKIE)?.value;
  const team = cookies.get(TEAM_COOKIE)?.value;
  return { ...(id ? { [WORKSPACE_HEADER]: id } : {}), ...(team ? { [TEAM_HEADER]: team } : {}) };
}

/** Switch workspace and reload so every cached query refetches for the new workspace. Its default team is used. */
export function switchWorkspace(id: string | undefined, path = "/dashboard") {
  setActiveWorkspaceId(id);
  setActiveTeamId(undefined);
  window.location.assign(path);
}

/** Switch team within the workspace and reload so lists show that team's envelopes, templates and folders. */
export function switchTeam(id: string | undefined, path?: string) {
  setActiveTeamId(id);
  window.location.assign(path ?? window.location.pathname);
}
