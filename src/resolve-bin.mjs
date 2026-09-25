import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

// Resolves a dependency's CLI entry point so the packaged bins can run tools
// such as czg and commitlint that are not linked into the consumer's
// node_modules/.bin.
export function resolvePackageBin(packageName, binName) {
  const packageJsonPath = findPackageJson(packageName)
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName]

  if (!bin)
    throw new Error(`${packageName} does not expose a "${binName}" bin`)

  return join(dirname(packageJsonPath), bin)
}

function findPackageJson(packageName) {
  try {
    return require.resolve(`${packageName}/package.json`)
  }
  catch {
    // Some packages hide package.json behind an exports map; walk up from the
    // resolved entry point instead.
    let directory = dirname(require.resolve(packageName))
    while (true) {
      const candidate = join(directory, 'package.json')
      if (existsSync(candidate))
        return candidate
      const parent = dirname(directory)
      if (parent === directory)
        throw new Error(`could not locate package.json for ${packageName}`)
      directory = parent
    }
  }
}
