import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/functions/**/*.test.js'],
    environment: 'node',
  },
})
