# release-tools-cli

Release and commit helpers for Git repositories. It cuts version tags, drafts Conventional Commits messages, and optionally asks OpenRouter for a suggested version bump.

## Install

```sh
npm install --save-dev release-tools-cli husky
```

## Setup

```sh
npx release-setup
```

`release-setup` writes a Husky `commit-msg` hook that runs commitlint, and a `commitlint.config.mjs` that re-exports this package's config. It uses the package manager it detects from your lockfile. Then add scripts to `package.json`:

```json
{
  "scripts": {
    "release": "release",
    "commit": "commit",
    "commit:ai": "commit-ai",
    "lint:commits": "release-lint"
  }
}
```

## Commands

| Command | Description |
| --- | --- |
| `release` | Reads the latest tag, asks for a patch/minor/major bump, writes version files, commits, tags, and pushes. |
| `release patch\|minor\|major` | Same, without the prompt. |
| `release --dry-run` | Prints the plan without writing, committing, tagging, or pushing. |
| `commit` | Interactive Conventional Commits prompt. |
| `commit:ai` | Drafts a commit message from the staged diff with OpenRouter. |
| `release-lint` | Runs commitlint; the Husky hook calls this. |
| `release-setup` | Writes the Husky hook and commitlint config. |

`commit:ai` flags: `--dry-run` prints the draft only, `--yes` accepts without review, `--force` skips the secret checks.

`release` refuses to run on a dirty tree, off its configured branch, or when the local branch is not in sync with its upstream.

## Configuration

Optional `release-tools.config.json` at the repo root. Defaults shown:

```json
{
  "branch": "main",
  "tagPrefix": "v",
  "versionFiles": ["package.json"],
  "envFiles": [".env"],
  "model": null,
  "commitAi": {
    "enabled": true,
    "allowPathPatterns": ["**/.env.example", "**/.env.test.example"],
    "denyPathPatterns": ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/*.p12", "**/secrets/**"],
    "denyContentPatterns": []
  }
}
```

- `versionFiles` are `package.json` files whose `version` field is bumped.
- `envFiles` are read for `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`. Environment variables take precedence.
- `model` overrides the default OpenRouter model.
- `commitAi.enabled` turns the AI commit command off for a repository.

## OpenRouter

The AI features call OpenRouter with Zero Data Retention. Set `OPENROUTER_API_KEY` in the environment or an `envFiles` entry. The `release` suggestion and `commit-ai` both degrade gracefully when the key is missing or the request fails.

`commit-ai` scans the staged diff before sending it. It refuses sensitive paths (`.env*`, key and certificate files, `secrets/**`) and likely secrets (OpenRouter, OpenAI, and AWS keys, PEM private keys, and `api_key`/`secret`/`password`/`token` assignments). It reports the pattern that matched, never the value. Pass `--force` to skip these checks, or adjust the patterns in `commitAi`.

## License

MIT
