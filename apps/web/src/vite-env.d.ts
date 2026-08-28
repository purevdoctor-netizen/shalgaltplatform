/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_QR_MAX_BYTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
