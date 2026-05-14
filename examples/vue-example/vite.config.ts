import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Mirrors examples/react-example/vite.config.ts. Distinct dev / preview
// ports (5174 / 4174) so both example apps can run simultaneously
// without `strictPort` collisions.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
})
