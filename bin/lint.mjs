#!/usr/bin/env node
import { main } from '../src/lint.mjs'
import { run } from '../src/run.mjs'

await run('release-lint', main)
