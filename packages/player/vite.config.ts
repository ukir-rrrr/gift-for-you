import { readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

const phaserFlags: Record<string, string> = {
  'typeof CANVAS_RENDERER': 'true',
  'typeof WEBGL_RENDERER': 'false',
  'typeof WEBGL_DEBUG': 'false',
  'typeof FEATURE_SOUND': 'false',
  'typeof PLUGIN_CAMERA3D': 'false',
  'typeof PLUGIN_FBINSTANT': 'false',
}

function rewritePhaser(code: string): string {
  let next = code
  for (const [flag, value] of Object.entries(phaserFlags)) next = next.replaceAll(flag, value)
  return next
    .replaceAll("require('phaser3spectorjs')", 'null')
    .replaceAll('global.Phaser = Phaser', 'globalThis.Phaser = Phaser')
}

function phaserDefines(): Plugin {
  return {
    name: 'phaser-defines',
    enforce: 'pre',
    config() {
      return {
        optimizeDeps: {
          esbuildOptions: {
            plugins: [
              {
                name: 'phaser-defines',
                setup(build) {
                  build.onLoad({ filter: /\/phaser\/src\/.*\.js$/ }, (args) => ({
                    contents: rewritePhaser(readFileSync(args.path, 'utf8')),
                    loader: 'js',
                  }))
                },
              },
            ],
          },
        },
      }
    },
    transform(code, id) {
      if (!id.includes('/phaser/src/')) return
      return rewritePhaser(code)
    },
  }
}

function giftApi(): Plugin {
  const goals = new Set<string>()
  const reveals: Record<string, string> = {
    demo: join(here, '../catalog/samples/demo.reveal.json'),
    offlist: join(here, '../catalog/samples/offlist.reveal.json'),
  }
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] ?? ''
    const event = url.match(/^\/s\/([^/]+)\/events$/)
    if (req.method === 'POST' && event) {
      const id = decodeURIComponent(event[1])
      void readBody(req).then((raw) => {
        try {
          const body = JSON.parse(raw) as { type?: string }
          if (body.type === 'goal_reached') goals.add(id)
        } catch {
          // ignore malformed beacons
        }
        res.statusCode = 204
        res.end()
      })
      return
    }
    const reveal = url.match(/^\/s\/([^/]+)\/reveal$/)
    if (req.method === 'GET' && reveal) {
      const id = decodeURIComponent(reveal[1])
      if (!goals.has(id)) {
        res.statusCode = 403
        res.setHeader('content-type', 'application/json')
        res.end('{"error":"not_ready"}')
        return
      }
      const file = reveals[id]
      if (!file) {
        res.statusCode = 404
        res.end('{}')
        return
      }
      res.setHeader('content-type', 'application/json')
      res.end(readFileSync(file))
      return
    }
    next()
  }
  return {
    name: 'gfy-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [phaserDefines(), giftApi()],
  resolve: {
    alias: [
      {
        find: /^phaser$/,
        replacement: fileURLToPath(new URL('./src/phaser-slim.js', import.meta.url)),
      },
      {
        find: 'phaser3spectorjs',
        replacement: fileURLToPath(new URL('./src/phaser-stub.js', import.meta.url)),
      },
    ],
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
})
