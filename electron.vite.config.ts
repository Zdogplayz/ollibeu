import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    define: {
      // Bake Google OAuth client keys into release builds (CI provides these
      // from repo secrets); empty in local builds unless the env sets them.
      __OLLIBEU_GID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ''),
      __OLLIBEU_GSECRET__: JSON.stringify(process.env.GOOGLE_CLIENT_SECRET ?? '')
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          capture: resolve(__dirname, 'src/renderer/capture.html')
        }
      }
    }
  }
})
