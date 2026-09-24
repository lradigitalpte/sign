import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [],
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
  ],
};
