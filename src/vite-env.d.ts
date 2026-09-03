/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog project API key — public/embeddable by design, not a secret. Unset = analytics silently no-op. */
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
