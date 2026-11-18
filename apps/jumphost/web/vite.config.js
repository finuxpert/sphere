import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// DEV and PROD are separate builds; do not reuse artifacts across prefixes.
const publicBase = process.env.JUMPHOST_WEB_BASE || '/remote/'
if (!['/remote/', '/dev/remote/'].includes(publicBase)) {
  throw new Error('JUMPHOST_WEB_BASE must be /remote/ or /dev/remote/')
}
const apiPrefix = `${publicBase}api/`

export default defineConfig({
  base: publicBase,
  plugins: [react()],
  server: {
    port: 5174, strictPort: true, host: '127.0.0.1',
    proxy: {
      [apiPrefix]: {
        target: 'http://127.0.0.1:8093',
        changeOrigin: false,
        rewrite: (path) => '/api/' + path.slice(apiPrefix.length),
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
