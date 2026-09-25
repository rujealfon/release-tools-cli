import conventional from '@commitlint/config-conventional'

export default {
  ...conventional,
  rules: {
    ...conventional.rules,
    // AI-drafted bodies arrive as a single line, so the default 100-character
    // limit rejects the message that "commit-ai" just proposed.
    'body-max-line-length': [0],
    // Footers often carry long URLs; the same 100-character limit applies.
    'footer-max-line-length': [0]
  }
}
