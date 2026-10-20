/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Customer app, linked from the sign-in screen. */
  readonly VITE_WEB_URL?: string;
  readonly VITE_WORKOS_CLIENT_ID?: string;
  readonly VITE_WORKOS_REDIRECT_URI?: string;
  /** WorkOS custom auth domain (production). Leave empty in development. */
  readonly VITE_WORKOS_API_HOSTNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
