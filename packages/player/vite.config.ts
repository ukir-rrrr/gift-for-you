import { readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))

function decodeSegment(raw: string): string | null {
  try {
    const id = decodeURIComponent(raw)
    return id.length > 0 ? id : null
  } catch {
    return null
  }
}

const BODY_MAX = 2048

/** Resolves null once the body passes BODY_MAX; beacons are tiny. */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let over = false
    req.on('data', (chunk: Buffer | string) => {
      if (over) return
      const buf = Buffer.from(chunk)
      size += buf.length
      if (size > BODY_MAX) {
        over = true
        resolve(null)
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => {
      if (!over) resolve(Buffer.concat(chunks).toString('utf8'))
    })
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
    // Gift pages and their API stay out of search, whatever the id resolves to.
    if (url.startsWith('/g/') || url.startsWith('/s/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    const event = url.match(/^\/s\/([^/]+)\/events$/)
    if (req.method === 'POST' && event) {
      const id = decodeSegment(event[1])
      if (!id) {
        res.statusCode = 400
        res.end()
        return
      }
      void readBody(req).then((raw) => {
        if (raw === null) {
          res.statusCode = 413
          res.end()
          return
        }
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
    // Samples are bundled with the player; any other id is a published gift the dev server does not hold.
    if (req.method === 'GET' && /^\/s\/[^/]+\/(share|photos\/[^/]+)$/.test(url)) {
      res.statusCode = 404
      res.setHeader('content-type', 'application/json')
      res.end('{"error":"not_found"}')
      return
    }
    if (req.method === 'POST' && /^\/s\/[^/]+\/unlock$/.test(url)) {
      res.statusCode = 403
      res.setHeader('content-type', 'application/json')
      res.end('{"error":"wrong"}')
      return
    }
    const reveal = url.match(/^\/s\/([^/]+)\/reveal$/)
    if (req.method === 'GET' && reveal) {
      const id = decodeSegment(reveal[1])
      if (!id) {
        res.statusCode = 400
        res.end()
        return
      }
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
