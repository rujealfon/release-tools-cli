#!/usr/bin/env node
import { main } from '../src/commit.mjs'
import { run } from '../src/run.mjs'

await run('commit', main)
