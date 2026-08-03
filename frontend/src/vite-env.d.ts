/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Browser-reachable API origin — see src/api/config.ts. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
