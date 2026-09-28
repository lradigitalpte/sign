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

/** Headers to add to direct fetch() calls against the platform API from the browser. */
export function workspaceHeaders(): Record<string, string> {
  const id = getActiveWorkspaceId();
  return id ? { [WORKSPACE_HEADER]: id } : {};
}

/** Headers for a Next.js route handler forwarding a request to the platform API. */
export function workspaceHeadersFromCookie(cookies: { get(name: string): { value: string } | undefined }): Record<string, string> {
  const id = cookies.get(WORKSPACE_COOKIE)?.value;
  return id ? { [WORKSPACE_HEADER]: id } : {};
}

/** Switch workspace and reload so every cached query refetches for the new workspace. */
export function switchWorkspace(id: string | undefined, path = "/dashboard") {
  setActiveWorkspaceId(id);
  window.location.assign(path);
}
