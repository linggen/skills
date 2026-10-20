/// <reference types="vite/client" />

interface ImportMeta {
  glob(pattern: string, options?: { as?: string; eager?: boolean }): Record<string, unknown>;
}
