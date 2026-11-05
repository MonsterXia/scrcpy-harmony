import { defineConfig } from 'vite'
import { resolve } from 'path'
import { builtinModules } from 'node:module'
import { alias, commonjsInclude } from './vite.config'

const builtins = builtinModules.filter((e) => !e.startsWith('_'))
builtins.push('electron', ...builtins.map((m) => `node:${m}`))

export default defineConfig({
  build: {
    commonjsOptions: { include: commonjsInclude },
    outDir: 'dist/main',
    lib: {
      entry: resolve(__dirname, 'src/main/index.ts'),
      name: 'Main',
      fileName: 'index',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [...builtins, 'usb'],
    },
  },
  resolve: {
    // The main process runs in Node. Browser export conditions select plist's
    // DOMParser implementation, which cannot enumerate Apple USB devices here.
    conditions: ['node', 'module', 'development|production'],
    mainFields: ['main', 'module'],
    alias,
  },
})
