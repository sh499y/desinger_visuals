import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
      '@panel': resolve('src/panel/src')
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Domyślnie Node; testy potrzebujące DOM ustawiają `// @vitest-environment happy-dom`.
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        // Wymagają prawdziwego Electrona, GPU albo przeglądarki – sprawdzane ręcznie / e2e.
        'src/main/index.ts',
        'src/main/window.ts',
        'src/preload/**',
        'src/renderer/src/engine/renderer.ts',
        'src/renderer/src/main.tsx',
        'src/panel/src/main.tsx'
      ],
      reporter: ['text-summary', 'html']
    }
  }
})
