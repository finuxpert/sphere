import { mergeConfig } from 'vite'
import base from '../../vite.config.js'

// DEV build preview only: browsers open loopback and GET source data from
// existing DEV /dev/api. Never rewrite into PROD /api routes.
export default mergeConfig(base, {
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/dev/api': {
        target: 'https://sphere.astraotoparts.co.id',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
