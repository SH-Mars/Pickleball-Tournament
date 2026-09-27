# Pickleball Tournament Organizer

A web app for running pickleball tournaments: enter players, generate teams under configurable rules, build a bracket, record scores, and export the result. It runs entirely in the browser. There is no server, database or account.

## Features

- **Players.** Name, optional gender, optional rating, active/inactive. Add one at a time, paste a list, or import a CSV. Export the roster as CSV.
- **Team generation.** Random, Balanced, Skill Balanced, Men's Doubles, Women's Doubles, Mixed Doubles and Custom.
  - Hard rules are never broken: team size, gender combinations, and "never on the same team" pairs.
  - Soft preferences, such as even team ratings, only guide the draw.
  - If no valid grouping exists, the app says so, explains the conflict and suggests relaxations that were tested to work.
- **Reproducible draws.** Every draw uses a visible seed. The same players, rules and seed give the same teams. Generated teams are also saved in the tournament file, so old tournaments keep their teams even if the algorithm changes.
- **Team editing.** Swap players, lock teams, and see which teams were changed by hand. Swaps that break a rule need confirmation.
- **Single-elimination bracket.** Any number of teams, with byes for top seeds. Optional third-place match. Best of 1, 3 or 5 games, configurable points to win and win-by-2.
- **Scoring.** Score validation, automatic advancement, and corrections. Changing a winner resets only the later results that depended on it, after you confirm.
- **Courts.** Assign matches to courts and start them from the Matches view.
- **Lock.** Starting the tournament locks players, teams and rules. Scores stay editable.
- **Save and share.** Save a `.pbt` file (JSON with a schema version), open it later by drop or file picker, or share a link or code that holds the whole tournament.
- **Export.** Download the bracket as PNG or PDF, with optional pairing strategy and seed.
- **Local recovery.** The current tournament is kept in browser storage as a convenience. The `.pbt` file is the real backup.

Round Robin, Double Elimination, Pool Play and consolation brackets appear in the interface as "Coming soon". The code is structured so they can be added.

## Run locally

Requires Node 20 or newer.

```bash
npm install
npm run dev      # development server
npm test         # unit tests
npm run build    # type-check and build dist/index.html
```

`npm run build` produces a single self-contained `dist/index.html`. You can host it on any static host or open it directly from disk.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project to the `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/pages.yml` runs the tests, builds the app and publishes it.
4. The site is available at `https://<your-username>.github.io/<repository-name>/`.

## Project layout

```
src/
  domain/            Pure logic, independent of the UI
    types.ts           Data model (Tournament, Player, Team, Match, ...)
    rng.ts             Seeded random numbers
    pairing/           Strategy registry, solver, diagnostics
    bracket/           Format registry, single elimination, scoring, advancement
    tournament.ts      Tournament operations (generate, lock, seed, courts)
    serialization.ts   .pbt save/load, validation, share links
  state/store.tsx    App state, local storage, dialogs, toasts
  ui/                Pages and components
  export/            Bracket SVG renderer, PNG and PDF export
  util/              File saving, roster import
tests/               Pairing, bracket and serialization tests
```

### Design notes

- Nothing is hard-coded to one tournament. The "more men than women, no Female + Female" case is the Custom strategy with Male + Male and Male + Female ticked.
- Match participants and winners are derived from the recorded games and the bracket structure, not stored. Advancement cannot get out of sync with the scores.
- To add a pairing strategy, call `registerStrategy` in `src/domain/pairing/strategies.ts`. To add a tournament format, add an entry in `src/domain/bracket/formats.ts` that builds a `Bracket` of matches whose slots refer to earlier matches.

## Tournament file format

A `.pbt` file is JSON:

```json
{
  "schemaVersion": 1,
  "applicationVersion": "1.0.0",
  "savedAt": "...",
  "tournament": { "...": "name, date, format, status, settings" },
  "players": [],
  "teams": [],
  "pairing": {},
  "bracket": { "formatId": "single_elimination", "rounds": [] },
  "matches": []
}
```

Files are validated on open. Corrupt files and files from a newer schema are rejected with a clear message.

## Limits

- One organizer per tournament. Data lives in one browser unless you save a file or share a link.
- Share links carry the whole tournament, so large tournaments produce long links. The app warns when a link is very long.
- Team search is exact for typical roster sizes (up to a few dozen players). Very large rosters with many restrictions may report that the search limit was reached.
