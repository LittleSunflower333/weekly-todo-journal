---
name: weekly-todo
description: Manage local JSON records for 一周 · Weekly, including daily todos, journal notes, weekly focus, reviews, and new weeks. Use for this filesystem-based Weekly app, not a Notion workspace.
---

# Weekly records

Operate on the user's local Weekly repository. This skill does not require a running server, a cloud account, or a particular agent provider.

## Locate and coordinate

- Resolve the project from the user's specified path or workspace. Verify `server.js`, `package.json`, and `data/index.json`; read the project's `AGENTS.md`. An installed skill's directory is not necessarily the project directory. Ask for the project path if unresolved.
- If data has not been initialized, explain and use the project's `npm run setup` within the user's authorization; never replace existing data with example records.
- Resolve relative dates in the user's local timezone. Use calendar dates, not UTC conversion of local midnight. Ask only when the target date or task is materially ambiguous.
- The browser saves entire week snapshots and does not detect external changes. Before writing, establish that pending browser saves have finished and the user has paused editing or closed the page. If this is unknown, request that coordination. Do not repeatedly ask if already established. After writing, tell the user to refresh before resuming browser edits.

## Data contract

`data/index.json` has the shape:

```json
{"weeks":[{"startDate":"2026-08-31","endDate":"2026-09-06"}]}
```

Keep entries unique and sorted by `startDate` descending. Each indexed week has a file `data/weeks/<startDate>.json` containing:

- `startDate`: Monday, `YYYY-MM-DD`; `endDate`: the following Sunday.
- `focus`: string array, one item per focus line.
- `days`: exactly seven objects in date order, each with `date`, `tasks`, and `note`.
- `tasks`: objects with a stable unique string `id`, string `text`, boolean `done`.
- `note`: plain text, preserving line breaks.
- `summary`: plain-text strings `highlight`, `blocked`, and `nextWeek`.

The application exports `createStore`, `makeWeek`, `validateWeek`, `shiftDate`, and `mondayOf` from `server.js`. Requiring this module does not start the server. Resolve it from the actual project path. `createStore(<project>/data)` exposes `readIndex`, `readWeek`, `saveWeek`, `createWeek`, and `atomicWrite`. Prefer existing validation and atomic writes rather than reimplementing storage. Atomic writes do not provide concurrent-editor locking.

## Apply only the requested record change

Read the index and target week freshly. Keep the original bytes for comparison before writing; if they change, reread and reassess instead of overwriting. This is a best-effort check, not a lock, so browser coordination still matters.

- Add: append a task using `crypto.randomUUID()` and `done: false` unless specified otherwise. Preserve existing task IDs.
- Complete/reopen: match the intended task and change only `done`. If multiple matches are plausible, clarify the target.
- Delete: remove only the requested task. Do not infer deletion from completion.
- Move: only when requested; remove from the source and insert into the destination, preserving ID and state. Validate both weeks and retain originals for recovery if one write fails.
- Note: append when the user says add/record; replace only when requested. Preserve existing text and line breaks.
- Focus/review: update only the requested array items or summary field. Ground summaries in existing records; distinguish proposed plans from completed events. Never invent personal experiences or infer completion merely from a note.
- Plan/review requests can be answered without writes. Persist only when the user requests or has already authorized doing so.

For an existing week, validate and use `store.saveWeek(startDate, week)`; the index should not change. For a new week, `store.createWeek()` creates the week after the latest indexed week, or the current week when empty. Use it only when that matches the requested dates, and first check there is no unindexed file at the destination that would be overwritten.

For an explicitly requested different week, use `makeWeek(monday)` and `shiftDate(monday, 6)`. Verify Monday, absence from both index and disk, and all seven dates. Write the new file and updated descending index atomically per file, preserving the original index and removing only the newly created file if updating the index fails. This is not a cross-file transaction. Never change an existing week's dates or carry unfinished tasks forward without a request.

## Verify and report

- Validate the changed week before saving; independently check the Monday boundary (the current validator does not enforce it).
- Reread the saved records, check the intended changes and preserved fields, and run `npm run check` from the project. Follow any additional project checks required by `AGENTS.md`.
- Report the actual date and concise changes. Explain a validation failure rather than claiming success. Do not silently repair unrelated historical data.
- Daily record work does not modify application code, theme preferences, or this skill. Theme preferences belong to browser localStorage, never week JSON.
- Do not commit, push, upload, or publish personal records as part of a record edit. `data/` is ignored by Git; a code push is not a journal backup.
