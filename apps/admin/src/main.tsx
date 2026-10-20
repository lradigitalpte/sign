import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthKitProvider } from "@workos-inc/authkit-react";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { AdminsPage } from "@/pages/admins";
import { AnnouncementsPage } from "@/pages/announcements";
import { AuditPage } from "@/pages/audit";
import { BillingPage } from "@/pages/billing";
import { DashboardPage } from "@/pages/dashboard";
import { DeletionsPage } from "@/pages/deletions";
import { EmailQueuePage } from "@/pages/email-queue";
import { EnvelopeDetailPage } from "@/pages/envelope-detail";
import { EnvelopesPage } from "@/pages/envelopes";
import { FlagsPage } from "@/pages/flags";
import { NotFoundPage } from "@/pages/placeholder";
import { SystemPage } from "@/pages/system";
import { UserDetailPage } from "@/pages/user-detail";
import { UsersPage } from "@/pages/users";
import { WorkspaceDetailPage } from "@/pages/workspace-detail";
import { WebhooksPage } from "@/pages/webhooks";
import { WorkspacesPage } from "@/pages/workspaces";

import "./index.css";

const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID;
if (!clientId) throw new Error("VITE_WORKOS_CLIENT_ID is not set. Copy apps/admin/.env.example to apps/admin/.env.");

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 } },
});

const router = createBrowserRouter([
  {
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "workspaces", element: <WorkspacesPage /> },
      { path: "workspaces/:id", element: <WorkspaceDetailPage /> },
      { path: "users", element: <UsersPage /> },
      { path: "users/:id", element: <UserDetailPage /> },
      { path: "admins", element: <AdminsPage /> },
      { path: "envelopes", element: <EnvelopesPage /> },
      { path: "envelopes/:id", element: <EnvelopeDetailPage /> },
      { path: "email-queue", element: <EmailQueuePage /> },
      { path: "webhooks", element: <WebhooksPage /> },
      { path: "deletions", element: <DeletionsPage /> },
      { path: "system", element: <SystemPage /> },
      { path: "announcements", element: <AnnouncementsPage /> },
      { path: "billing", element: <BillingPage /> },
      { path: "flags", element: <FlagsPage /> },
      { path: "audit", element: <AuditPage /> },
      { path: "callback", element: null },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

// Production uses a WorkOS custom auth domain. In development, WorkOS calls go to this app's own origin and the
// Vite dev server proxies /user_management to api.workos.com (see vite.config.ts), so no CORS setup is needed.
const workosHost = import.meta.env.VITE_WORKOS_API_HOSTNAME
  ? { apiHostname: import.meta.env.VITE_WORKOS_API_HOSTNAME }
  : import.meta.env.DEV
    ? {
        apiHostname: window.location.hostname,
        port: window.location.port ? Number(window.location.port) : undefined,
        https: window.location.protocol === "https:",
      }
    : {};

/** Only same-site paths are allowed as a post-sign-in destination. */
function safeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthKitProvider
        clientId={clientId}
        {...workosHost}
        redirectUri={import.meta.env.VITE_WORKOS_REDIRECT_URI ?? `${window.location.origin}/callback`}
        // Without a WorkOS custom auth domain the refresh token has to live in local storage (dev only).
        devMode={import.meta.env.DEV}
        onRedirectCallback={({ state }) => void router.navigate(safeReturnTo(state?.returnTo), { replace: true })}
      >
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AuthKitProvider>
    </ThemeProvider>
  </StrictMode>,
);
