import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const defaults = {
  branch: 'main',
  tagPrefix: 'v',
  versionFiles: ['package.json'],
  envFiles: ['.env'],
  model: null,
  commitAi: {
    enabled: true,
    allowPathPatterns: ['**/.env.example', '**/.env.test.example'],
    denyPathPatterns: ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/*.p12', '**/secrets/**'],
    denyContentPatterns: [
      'sk-or-v1-[A-Za-z0-9]{16,}',
      'sk-[A-Za-z0-9]{20,}',
      'AKIA[0-9A-Z]{16}',
      '-----BEGIN [A-Z ]*PRIVATE KEY-----',
      '(api[_-]?key|apikey|secret|password|passwd|token)\\s*[:=]\\s*["\']?[A-Za-z0-9_\\-+/=]{20,}'
    ]
  }
}

export function loadConfig(root) {
  const path = join(root, 'release-tools.config.json')
  if (!existsSync(path))
    return structuredClone(defaults)

  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  }
  catch (error) {
    process.stderr.write(`release-tools-cli: could not read release-tools.config.json: ${error.message}\n`)
    process.exit(1)
  }

  return {
    ...defaults,
    ...parsed,
    commitAi: { ...defaults.commitAi, ...(parsed.commitAi ?? {}) }
  }
}
