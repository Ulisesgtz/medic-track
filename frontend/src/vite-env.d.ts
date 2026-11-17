/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * specs/072: `true` only in the E2E build (scripts/e2e-local.sh and the CI job): it adds the route `/__prueba-error`, which
   * breaks on purpose to see the error screen. Never in DEV or in production.
   */
  readonly VITE_TEST_ERROR_ROUTE?: string
}
