import conventional from '@commitlint/config-conventional'
import createPreset from 'conventional-changelog-conventionalcommits'

const preset = await createPreset()

export default {
  ...conventional,
  parserPreset: {
    name: 'conventional-changelog-conventionalcommits',
    parserOpts: preset.parserOpts ?? preset.parser
  },
  rules: {
    ...conventional.rules,
    'body-max-line-length': [0],
    'footer-max-line-length': [0]
  }
}