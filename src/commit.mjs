import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { resolvePackageBin } from './resolve-bin.mjs'

// Interactive conventional-commit prompt, backed by czg.
export async function main() {
  const bin = resolvePackageBin('czg', 'czg')
  const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
