import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { repoRoot } from './git.mjs'

const commitlintConfig = `import config from 'release-tools-cli/commitlint'

export default config
`

function detectPackageManager(root) {
  if (existsSync(join(root, 'pnpm-lock.yaml')))
    return 'pnpm'
  if (existsSync(join(root, 'yarn.lock')))
    return 'yarn'
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock')))
    return 'bun'
  return 'npm'
}

function hookCommand(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm exec release-lint --edit "$1"'
    case 'yarn':
      return 'yarn release-lint --edit "$1"'
    case 'bun':
      return 'bunx release-lint --edit "$1"'
    default:
      return 'npx --no-install release-lint --edit "$1"'
  }
}

export async function main() {
  const root = repoRoot()
  const packageManager = detectPackageManager(root)
  const hooksDirectory = join(root, '.husky')

  if (!existsSync(hooksDirectory)) {
    process.stderr.write('release-tools-cli: .husky/ not found. Install husky first, then rerun release-setup.\n')
    process.exit(1)
  }

  writeFileSync(join(hooksDirectory, 'commit-msg'), `${hookCommand(packageManager)}\n`)
  chmodSync(join(hooksDirectory, 'commit-msg'), 0o755)
  process.stdout.write(`Wrote .husky/commit-msg using ${packageManager}.\n`)

  if (existsSync(join(root, 'commitlint.config.mjs'))) {
    process.stdout.write('commitlint.config.mjs already exists; leaving it unchanged.\n')
  }
  else {
    writeFileSync(join(root, 'commitlint.config.mjs'), commitlintConfig)
    process.stdout.write('Wrote commitlint.config.mjs.\n')
  }

  process.stdout.write('\nSuggested package.json scripts:\n')
  process.stdout.write('  "release": "release",\n')
  process.stdout.write('  "commit": "commit",\n')
  process.stdout.write('  "commit:ai": "commit-ai",\n')
  process.stdout.write('  "lint:commits": "release-lint"\n')
}
