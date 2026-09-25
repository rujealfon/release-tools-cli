import process from 'node:process'

// Runs a CLI entry point and turns a thrown git or provider error into a single
// readable line instead of a stack trace.
export async function run(prefix, fn) {
  try {
    await fn()
  }
  catch (error) {
    const detail = (error.stderr ?? error.stdout ?? '').toString().trim()
    process.stderr.write(`${prefix}: ${detail || error.message}\n`)
    process.exit(1)
  }
}
