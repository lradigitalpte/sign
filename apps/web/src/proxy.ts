import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy({
  middlewareAuth: {
    enabled: true,
    // Invitation links must open for people who haven't signed in yet.
    // The sign-in and sign-up pages are public too; they run through the proxy only so they can
    // detect an existing session and send signed-in users straight to the app.
    unauthenticatedPaths: ["/invitations/:path*", "/signin", "/signup"],
  },
  signUpPaths: ["/auth/sign-up"],
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/inbox/:path*",
    "/self-sign/:path*",
    "/signature/:path*",
    "/envelopes/:path*",
    "/api/envelopes/:path*",
    "/folders/:path*",
    "/templates/:path*",
    "/members/:path*",
    "/teams/:path*",
    "/organizations/:path*",
    "/settings/:path*",
    "/invitations/:path*",
    "/signin",
    "/signup",
  ],
};
