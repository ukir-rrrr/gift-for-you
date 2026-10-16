// Fails when something that looks like a real key is committed. Providers are switched with vars and
// keys go in with `wrangler secret put` / EAS secrets (docs/phase3.md), never in the tree.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['RevenueCat secret key', /\bsk_[A-Za-z0-9]{20,}/],
  ['RevenueCat public iOS key', /\bappl_[A-Za-z0-9]{20,}/],
  ['RevenueCat public Android key', /\bgoog_[A-Za-z0-9]{20,}/],
  ['Expo access token', /\bexpo_[A-Za-z0-9_-]{30,}/i],
  ['private key block', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
  ['Slack or GitHub token', /\b(?:xox[abp]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{30,})/],
]

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && !/\.(png|jpg|woff2|ico)$/.test(file) && file !== 'pnpm-lock.yaml')
const hits = []
for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const [name, pattern] of PATTERNS) if (pattern.test(text)) hits.push(`${file}: ${name}`)
}
if (hits.length > 0) {
  console.error(`Possible secrets committed:\n${hits.join('\n')}`)
  process.exit(1)
}
console.log(`checked ${files.length} files, no secrets found`)
