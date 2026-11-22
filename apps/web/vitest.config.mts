import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Клиентам API нужны только fetch, Response и JSON: в Node 22 они встроены.
    // jsdom понадобится тестам компонентов, его можно включить только для них.
    environment: 'node',
    // После каждого теста вернуть настоящие глобалы, подменённые через vi.stubGlobal.
    unstubGlobals: true,
  },
});
