# Working rules for this repository

Släktsagan is a browser-based genealogy workbench: one static page, no build
step, no account. Read README.md before changing anything. The UI is Swedish;
everything in the repository (code, comments, commits, README, docs) is
English.

## How it is built
- Static site served as is: index.html, src/ (core.js holds the logic,
  app/ the UI), sw.js for offline use. No bundler. Keep it that way unless the
  owner decides otherwise.
- Sharing uses Supabase (supabase/migrations). The owner applies migrations;
  never run them, never connect to the live project, never add keys.
- The site is deployed from main to släktsagan.se. Anything merged is live.

## Checks
- `npm run lint`, `npm run typecheck`, `npm test` before every push.
- `npm run test:e2e` (Playwright) for UI changes. Install the browser first
  with `npx playwright install --with-deps chromium`.
- Every import carries the release's `?v=` so a browser never mixes two
  releases. For a release, run `npm run bump`, which moves them all; never
  edit the versions by hand.

## Personal data (no exceptions)
A family tree is about real people, many of them alive. This repository is
public.
- Never commit a real family tree, GEDCOM, export, screenshot or test data
  about real private people. Personal data belongs in ignored folders
  (private/, *.local.*, exported slaktsagan-*.json).
- Examples and tests use fictional people ("Fictional example person") or
  long-dead public historical figures such as the House of Vasa.
- Data stays in the user's browser unless they share it. Do not add
  analytics, tracking, third-party requests or uploads without the owner's
  decision.
- Riksarkivet (sok.riksarkivet.se) and other archives: tests use saved,
  scrubbed fixtures, never live requests.

## Git and pull requests
- One feature per branch from main. Small working commits are fine; the owner
  squashes.
- No Co-Authored-By, Claude-Session or other AI attribution in commits or
  pull requests.
- Never push to main. Push the branch and open a pull request.
- Do not write or edit docs/decisions.md. The owner writes it.
- Licence is AGPL-3.0. Do not copy code with an incompatible licence.

## Report (pull request description)
- What changed and why.
- What you verified, and how (checks, e2e, manual).
- Anything that touches personal data, sharing or the service worker.
- Open questions, and decisions worth recording in docs/decisions.md (as
  bullet points for the owner to write up).
- A proposed squash commit message in English that explains why.
