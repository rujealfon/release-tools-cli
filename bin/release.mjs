#!/usr/bin/env node
import { main } from '../src/release.mjs'
import { run } from '../src/run.mjs'

await run('release', main)
