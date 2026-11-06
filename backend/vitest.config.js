import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    // O driver SQLite abre um arquivo; cada arquivo de teste roda em
    // processo próprio (pool: 'forks') para não compartilhar o handle.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/db/seed.js',
        'src/index.js',
        'src/app.js',
        // Driver Postgres: exercitado no CI contra um container real
        // (job separado). A suíte local roda 100% em SQLite.
        'src/db/postgres.js'
      ],
      thresholds: {
        lines: 55,
        branches: 45,
        functions: 40,
        statements: 55
      }
    },
    testTimeout: 20000,
    hookTimeout: 20000
  }
});
