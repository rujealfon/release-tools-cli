#!/usr/bin/env node
import { main } from '../src/commit-ai.mjs'
import { run } from '../src/run.mjs'

await run('commit-ai', main)
