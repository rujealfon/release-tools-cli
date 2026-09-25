import { execFileSync } from 'node:child_process'
import process from 'node:process'

let cachedRoot = null

export function repoRoot() {
  if (cachedRoot)
    return cachedRoot

  try {
    cachedRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
  }
  catch {
    process.stderr.write('release-tools-cli: not inside a git repository.\n')
    process.exit(1)
  }

  return cachedRoot
}

export function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function truncate(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n... [truncated]`
}
