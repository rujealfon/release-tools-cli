#!/usr/bin/env node
import { run } from '../src/run.mjs'
import { main } from '../src/setup.mjs'

await run('release-setup', main)
