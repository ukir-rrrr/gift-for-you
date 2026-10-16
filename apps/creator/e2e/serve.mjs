// Serves the exported web build with a single-page fallback. Local runs and e2e only.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const port = Number(process.env.PORT ?? 8081)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.ttf': 'font/ttf' }

createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  let file = join(root, path)
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`creator web on http://127.0.0.1:${port}`))
