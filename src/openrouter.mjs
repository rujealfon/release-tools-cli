import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'

export const defaultModel = 'qwen/qwen3-30b-a3b-instruct-2507'
const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions'

function readEnvFile(path) {
  try {
    const env = {}
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (match)
        env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
    }
    return env
  }
  catch {
    return {}
  }
}

// Environment variables win, then each configured env file in order.
export function readEnv(root, envFiles) {
  const env = {}
  for (const file of envFiles) {
    Object.assign(env, readEnvFile(isAbsolute(file) ? file : join(root, file)))
  }

  for (const key of ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL']) {
    // eslint-disable-next-line node/no-process-env
    const value = process.env[key]
    if (value)
      env[key] = value
  }

  return env
}

function parseJsonObject(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start)
    return null

  try {
    return JSON.parse(text.slice(start, end + 1))
  }
  catch {
    return null
  }
}

export async function requestJson({ apiKey, model, system, user, maxTokens = 400 }) {
  const response = await fetch(openRouterUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'release-tools-cli'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      response_format: { type: 'json_object' },
      provider: { zdr: true, require_parameters: true },
      max_tokens: maxTokens,
      temperature: 0
    }),
    signal: AbortSignal.timeout(45_000)
  })

  if (!response.ok)
    throw new Error(`OpenRouter returned HTTP ${response.status}`)

  const data = await response.json()
  const parsed = parseJsonObject(data?.choices?.[0]?.message?.content ?? '')
  if (!parsed)
    throw new Error('OpenRouter response had no usable JSON')

  return parsed
}
