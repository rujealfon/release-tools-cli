import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { loadConfig } from './config.mjs'
import { repoRoot, runGit, truncate } from './git.mjs'
import { defaultModel, readEnv, requestJson } from './openrouter.mjs'

function fail(message) {
  process.stderr.write(`commit-ai: ${message}\n`)
  process.exit(1)
}

function stagedChanges() {
  return {
    files: runGit(['diff', '--cached', '--name-status']),
    stat: runGit(['diff', '--cached', '--stat']),
    diff: runGit(['diff', '--cached', '--no-color', '-U1'])
  }
}

function globToRegExp(glob) {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') {
        if (glob[index + 2] === '/') {
          pattern += '(?:.*/)?'
          index += 2
        }
        else {
          pattern += '.*'
          index += 1
        }
      }
      else {
        pattern += '[^/]*'
      }
    }
    else if (char === '?') {
      pattern += '[^/]'
    }
    else if ('\\^$.|+()[]{}'.includes(char)) {
      pattern += `\\${char}`
    }
    else {
      pattern += char
    }
  }
  return new RegExp(`^${pattern}$`)
}

function matchesAny(value, patterns) {
  return patterns.some(pattern => globToRegExp(pattern).test(value))
}

// Refuses to send sensitive paths or likely secrets. The matched secret value
// is never printed, only the pattern that matched.
function assertSafe({ stagedPaths, diff, commitAi }) {
  const candidates = stagedPaths.filter(path => !matchesAny(path, commitAi.allowPathPatterns))
  const deniedPaths = candidates.filter(path => matchesAny(path, commitAi.denyPathPatterns))
  if (deniedPaths.length > 0)
    fail(`refusing to send sensitive paths to OpenRouter:\n  ${deniedPaths.join('\n  ')}\nUnstage them or rerun with --force.`)

  const deniedPattern = commitAi.denyContentPatterns.find(pattern => new RegExp(pattern, 'im').test(diff))
  if (deniedPattern)
    fail(`refusing to send the diff: it matches a secret pattern (${deniedPattern}). Unstage the secret or rerun with --force.`)
}

async function draftMessage({ apiKey, model, files, stat, diff }) {
  const system = [
    'You write Conventional Commits messages for a software repository.',
    'Respond with JSON only: {"subject":"<type>(<scope>): <description>","body":"<details or empty string>"}.',
    'The subject starts with one of feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, then an optional (scope), then ": ".',
    'Use an imperative, lowercase description with no trailing period, at most 72 characters.',
    'Add a body only when the change needs context; otherwise return an empty string.',
    'Mark breaking changes with "!" before the colon and explain them in the body.',
    'Describe the entire staged change as one commit.'
  ].join(' ')

  const user = `Changed files:\n${truncate(files, 4_000)}\n\nDiff stat:\n${truncate(stat, 4_000)}\n\nDiff:\n${truncate(diff, 12_000)}`

  const parsed = await requestJson({ apiKey, model, system, user, maxTokens: 600 })
  const subject = String(parsed.subject ?? '').trim()
  if (!subject)
    fail('OpenRouter returned no commit subject.')

  return { subject, body: String(parsed.body ?? '').trim() }
}

function commit({ subject, body, edit }) {
  const args = ['commit']
  if (edit)
    args.push('-e')
  args.push('-m', subject)
  if (body)
    args.push('-m', body)

  execFileSync('git', args, { cwd: repoRoot(), stdio: 'inherit' })
}

export async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const yes = args.includes('--yes') || args.includes('-y')
  const force = args.includes('--force')

  const root = repoRoot()
  const config = loadConfig(root)
  if (!config.commitAi.enabled)
    fail('AI commits are disabled by release-tools.config.json. Use "commit" instead.')

  const stagedPaths = runGit(['diff', '--cached', '--name-only']).split('\n').filter(Boolean)
  if (stagedPaths.length === 0)
    fail('nothing is staged. Add files with "git add" first.')

  const changes = stagedChanges()
  if (!force)
    assertSafe({ stagedPaths, diff: changes.diff, commitAi: config.commitAi })

  const env = readEnv(root, config.envFiles)
  const apiKey = env.OPENROUTER_API_KEY
  if (!apiKey)
    fail('no OPENROUTER_API_KEY found. Set it in the environment or a configured env file.')

  const model = env.OPENROUTER_MODEL ?? config.model ?? defaultModel

  while (true) {
    process.stdout.write('\nAsking OpenRouter for a commit message...\n')
    const { subject, body } = await draftMessage({ apiKey, model, ...changes })

    process.stdout.write(`\n${subject}\n`)
    if (body)
      process.stdout.write(`\n${body}\n`)

    if (dryRun) {
      process.stdout.write('\nDry run: not committing.\n')
      return
    }

    if (yes)
      return commit({ subject, body, edit: false })

    if (!process.stdin.isTTY)
      fail('stdin is not interactive. Use --dry-run, --yes, or run this in a terminal.')

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    let answer
    try {
      answer = (await rl.question('\n[a]ccept / [e]dit in editor / [r]egenerate / [c]ancel: ')).trim().toLowerCase()
    }
    finally {
      rl.close()
    }

    if (answer === 'a' || answer === '')
      return commit({ subject, body, edit: false })
    if (answer === 'e')
      return commit({ subject, body, edit: true })
    if (answer === 'c')
      return
    // Any other input regenerates the draft.
  }
}
