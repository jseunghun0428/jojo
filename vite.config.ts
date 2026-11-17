import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error The local Vite middleware is a Node-only ES module.
import { stageStorage } from './tools/stage-storage.mjs'

export default defineConfig(({ command, isPreview, mode }) => ({
  publicDir: command === 'serve' && !isPreview ? 'local-graphics' : false,
  cacheDir: mode === 'stage-editor' ? 'node_modules/.vite-stage-editor' : undefined,
  plugins: [react(), stageStorage(mode === 'stage-editor')],
  base: './',
  build: {
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
    chunkSizeWarningLimit: 1500,
  },
}))
