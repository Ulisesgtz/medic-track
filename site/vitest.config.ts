import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Las pruebas de sincronía leen archivos del frontend (tokens, precios) y del backend.
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts', 'content/**/*.ts'],
      exclude: [
        'src/setupTests.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.test-utils.ts',
        'src/test-utils.tsx',
        'src/vite-env.d.ts',
        // Entradas de línea de comandos: solo llaman a funciones probadas.
        'scripts/og.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
    // La primera compilación de Tailwind y el prerender tardan en una máquina fría.
    testTimeout: 30_000,
  },
})
