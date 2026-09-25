import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { loadConfig } from './config.mjs'
import { escapeRegExp, repoRoot, runGit, truncate } from './git.mjs'
import { defaultModel, readEnv, requestJson } from './openrouter.mjs'

const bumpTypes = ['patch', 'minor', 'major']

function fail(message) {
  process.stderr.write(`release: ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const options = { bump: null, branch: null, dryRun: false, yes: false, commit: true, suggest: true, apiKey: null }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (bumpTypes.includes(arg)) {
      options.bump = arg
    }
    else if (arg === '--branch') {
      options.branch = argv[index + 1]
      index += 1
      if (!options.branch)
        fail('--branch needs a value.')
    }
    else if (arg === '--api-key') {
      options.apiKey = argv[index + 1]
      index += 1
      if (!options.apiKey)
        fail('--api-key needs a value.')
    }
    else if (arg === '--dry-run') {
      options.dryRun = true
    }
    else if (arg === '--yes' || arg === '-y') {
      options.yes = true
    }
    else if (arg === '--no-commit') {
      options.commit = false
    }
    else if (arg === '--no-suggest') {
      options.suggest = false
    }
    else {
      fail(`unknown argument "${arg}". Use patch, minor, or major.`)
    }
  }

  return options
}

function latestTag(tagPrefix) {
  try {
    return runGit(['describe', '--tags', '--abbrev=0', '--match', `${tagPrefix}[0-9]*`])
  }
  catch {
    return `${tagPrefix}0.0.0`
  }
}

function parseVersion(tag, tagPrefix) {
  const match = new RegExp(`^${escapeRegExp(tagPrefix)}(\\d+)\\.(\\d+)\\.(\\d+)$`).exec(tag)
  if (!match)
    fail(`latest tag "${tag}" is not a ${tagPrefix}X.Y.Z version.`)

  return match.slice(1).map(Number)
}

function nextVersion(version, bump) {
  const [major, minor, patch] = version

  if (bump === 'major')
    return [major + 1, 0, 0]
  if (bump === 'minor')
    return [major, minor + 1, 0]

  return [major, minor, patch + 1]
}

function format(tagPrefix, version) {
  return `${tagPrefix}${version.join('.')}`
}

// Returns { bump, reason } or null. A missing key, network error, or an
// unusable model response never blocks a release; it falls back to the prompt.
async function suggestBump({ apiKey, model, tag, commits, stat }) {
  const system = [
    'You classify a software change for semantic versioning.',
    'Respond with JSON only: {"bump":"patch|minor|major","reason":"one short sentence"}.',
    'major: a breaking change to public behavior, URLs, or data contracts.',
    'minor: new user-visible content, pages, or features. patch: fixes, tuning, refactors, docs, internal changes.',
    'Judge the actual changes and their size, not commit-message prefixes.'
  ].join(' ')

  const user = `Commits since ${tag}:\n${truncate(commits, 8_000)}\n\nDiff stat:\n${truncate(stat, 8_000)}`

  try {
    const parsed = await requestJson({ apiKey, model, system, user, maxTokens: 400 })
    if (!bumpTypes.includes(parsed.bump))
      throw new Error('OpenRouter response had no usable bump')

    return { bump: parsed.bump, reason: String(parsed.reason ?? '').trim() }
  }
  catch (error) {
    process.stderr.write(`release: OpenRouter suggestion unavailable (${error.message}).\n`)
    return null
  }
}

async function chooseBump(tagPrefix, version, suggestion) {
  const choices = bumpTypes.map((bump, index) => (
    `  ${index + 1}) ${bump.padEnd(5)} ${format(tagPrefix, version)} -> ${format(tagPrefix, nextVersion(version, bump))}`
  ))

  process.stdout.write(`\nLatest tag is ${format(tagPrefix, version)}. Select a release type:\n${choices.join('\n')}\n`)

  if (suggestion)
    process.stdout.write(`OpenRouter suggests ${suggestion.bump}: ${suggestion.reason || 'no reason given'}\n`)

  const defaultIndex = suggestion ? bumpTypes.indexOf(suggestion.bump) + 1 : null
  const hint = defaultIndex ? `[${defaultIndex}]` : '[1/2/3]'

  if (!process.stdin.isTTY) {
    if (suggestion) {
      process.stdout.write(`No TTY; using the suggested ${suggestion.bump} bump.\n`)
      return suggestion.bump
    }
    fail('no release type given and stdin is not interactive. Run "release patch|minor|major".')
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    while (true) {
      const answer = (await rl.question(`Release type ${hint}: `)).trim()
      if (!answer && defaultIndex)
        return bumpTypes[defaultIndex - 1]

      const index = Number(answer)
      if (Number.isInteger(index) && index >= 1 && index <= bumpTypes.length)
        return bumpTypes[index - 1]

      process.stdout.write('Enter 1, 2, or 3.\n')
    }
  }
  finally {
    rl.close()
  }
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`${question} [y/N]: `)).trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  }
  finally {
    rl.close()
  }
}

function writeVersions(root, files, version) {
  for (const file of files) {
    const path = isAbsolute(file) ? file : join(root, file)
    const packageJson = JSON.parse(readFileSync(path, 'utf8'))
    packageJson.version = version.join('.')
    writeFileSync(path, `${JSON.stringify(packageJson, null, 2)}\n`)
  }
}

export async function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = repoRoot()
  const config = loadConfig(root)
  const branch = options.branch ?? config.branch
  const { tagPrefix } = config

  if (options.dryRun)
    process.stdout.write('Dry run: no files are written, no commits, tags, or pushes.\n')

  const status = runGit(['status', '--porcelain'])
  if (status)
    fail('the working tree has uncommitted changes. Commit or stash them first.')

  const currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (currentBranch !== branch)
    fail(`expected branch "${branch}" but the current branch is "${currentBranch}".`)

  process.stdout.write(`Fetching origin/${branch} and tags...\n`)
  runGit(['fetch', '--tags', 'origin', branch])

  const head = runGit(['rev-parse', 'HEAD'])
  const upstream = runGit(['rev-parse', `origin/${branch}`])
  if (head !== upstream)
    fail(`local ${branch} is not in sync with origin/${branch}. Run "git pull --ff-only origin ${branch}".`)

  const tag = latestTag(tagPrefix)
  const version = parseVersion(tag, tagPrefix)

  let bump = options.bump
  if (!bump) {
    const commits = runGit(['log', '--no-decorate', '--format=%s', `${tag}..HEAD`])
    const stat = runGit(['diff', '--stat', `${tag}..HEAD`])
    process.stdout.write(`\nChanges since ${tag}:\n${commits || '(no commits)'}\n\n${stat || '(no file changes)'}\n`)

    const env = readEnv(root, config.envFiles)
    const apiKey = options.apiKey ?? env.OPENROUTER_API_KEY
    let suggestion = null
    if (options.suggest && apiKey) {
      process.stdout.write('\nAsking OpenRouter for a suggestion...\n')
      suggestion = await suggestBump({ apiKey, model: env.OPENROUTER_MODEL ?? config.model ?? defaultModel, tag, commits, stat })
    }
    else if (options.suggest) {
      process.stdout.write('\nNo OPENROUTER_API_KEY found; skipping the suggestion. Pass --api-key or add it to an env file.\n')
    }

    bump = await chooseBump(tagPrefix, version, suggestion)
  }

  const next = nextVersion(version, bump)
  const nextTag = format(tagPrefix, next)

  process.stdout.write(`\nRelease ${format(tagPrefix, version)} -> ${nextTag} (${bump}${options.commit ? ', commits version files' : ', tags current commit'}).\n`)

  if (!options.yes && !options.dryRun) {
    const proceed = await confirm('Create and push this tag?')
    if (!proceed) {
      process.stdout.write('Aborted.\n')
      return
    }
  }

  if (options.commit && !options.dryRun) {
    writeVersions(root, config.versionFiles, next)
    runGit(['add', ...config.versionFiles])
    runGit(['commit', '-m', `chore(release): ${nextTag}`, '-m', `Release ${nextTag}.`])
  }

  if (options.dryRun) {
    process.stdout.write(`Would tag ${nextTag} and push it to origin.\n`)
    return
  }

  runGit(['tag', '-a', nextTag, '-m', `Release ${nextTag}`])

  if (options.commit)
    runGit(['push', 'origin', branch])

  runGit(['push', 'origin', nextTag])

  process.stdout.write(`\nPushed ${nextTag}. Push it from CI or let your release workflow react to the tag.\n`)
}
