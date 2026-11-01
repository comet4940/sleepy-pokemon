# Notes for Claude

## Git branches

- Name branches after the change, not the session: `<type>/<short-kebab-description>`.
  - Types: `fix/`, `feat/`, `chore/`, `docs/`, `content/` (card or guide edits).
  - Examples: `fix/larvesta-why-it-belongs`, `feat/artist-filter`, `chore/refresh-prices`.
- This applies even when a session is started with an auto-generated branch name (e.g. `claude/<random-words>`): use a descriptive name instead.
- Branch from the latest `main`, one branch per change.
