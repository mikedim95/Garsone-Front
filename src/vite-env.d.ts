/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_OFFLINE?: string;
  readonly VITE_PUBLIC_BASE_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
