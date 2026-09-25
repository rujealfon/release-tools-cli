import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { resolvePackageBin } from './resolve-bin.mjs'

// Runs commitlint with the arguments it is given, so a Husky commit-msg hook can
// call it the same way it would call commitlint directly. The child's exit code
// is passed through so the hook fails when commitlint fails.
export async function main() {
  const bin = resolvePackageBin('@commitlint/cli', 'commitlint')
  const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
