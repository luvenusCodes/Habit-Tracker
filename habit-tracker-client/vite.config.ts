import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // Import tailwind plugin

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),  // Register it in the plugins array
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
})