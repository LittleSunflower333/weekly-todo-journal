# 一周 · Weekly

**One week per screen. Plans and journal entries in files you own.**

A local-first weekly todo and journal app. Seven days sit side by side; scroll vertically through weeks. Edit in the browser or let an agent work with the same JSON files.

[中文](README.md) · English

![Weekly planner](docs/images/weekly-planner.png)

App preview with fictional example records.

## Features

- Weekly focus, daily todos, 🌱 journal notes, and a three-part weekly review: highlights, blockers, and next week.
- A desktop weekly planner with vertical scroll snapping, lazy-loaded history, and year / month / week navigation.
- Inline editing, autosave, task completion, and history search.
- Classic plus six preset palettes, adjustable today highlighting, and minimal / soft color modes.
- One readable JSON file per week, editable by hand or by an agent with local filesystem access.

No account, cloud database, or third-party runtime dependencies. The interface is currently in Chinese and primarily designed for desktop use.

## Quick start

Requires **Node.js 18+** and a modern browser with native Popover support. No `npm install` needed.

```bash
git clone https://github.com/LittleSunflower333/weekly-todo-journal.git
cd weekly-todo-journal
npm run setup
npm start
```

Open [localhost:4173](http://localhost:4173). Stop with `Control-C`. If the port is busy, use `PORT=4174 npm start` on macOS / Linux.

Your first launch has no records. Click `＋` in the upper right to create the current week. With existing records, it creates the week after the latest recorded week. Running setup again preserves existing data.

## Everyday use

1. Write one focus item per line in the weekly focus area.
2. Add daily todos; press Enter or leave the input to confirm a new task. Check tasks when finished.
3. Record daily thoughts in the 🌱 journal area.
4. Fill in highlights, blockers, and next week's plans, then create the next week.

Existing task text, focus, notes, and review text save about 650ms after typing stops. Checkbox changes and confirmed additions / deletions save immediately. Check the save status before leaving. Browse history through the sidebar, search, or downward scrolling. Unfinished tasks are not automatically carried forward.

The `🎨 外观` appearance control stays at the bottom of the sidebar and remains available as an icon when collapsed. Preferences use only browser localStorage keys `weekly.theme`, `weekly.colorMode`, and `weekly.todayHighlight`; they never enter journal JSON.

## Use with an agent

The repository includes a [weekly-todo Skill](skills/weekly-todo/SKILL.md) covering dates, data structure, task IDs, edits, and validation. It operates on local Weekly files, without Notion or an additional AI API key. Your chosen agent service may have its own costs and data handling terms.

Ask an agent with local filesystem access to open the project and read the skill:

```text
My project is at /your/path/weekly-todo-journal.
Read AGENTS.md and skills/weekly-todo/SKILL.md first.
The browser has finished saving and editing is paused.
Add “Organize reading notes” to today's todos.
```

You can then ask it to mark a task complete, append a daily note, draft a weekly review for approval, or move a specific unfinished task to another date.

Alternatively, import the whole `skills/weekly-todo` folder using your agent's skill installation mechanism. You still need to provide the actual project path. Cloning this repository does not automatically install the skill in every agent.

**Take turns editing in the browser and through an agent.** The browser saves whole-week snapshots without conflict detection. Finish browser saves and pause editing or close the page before agent changes. Refresh afterward before editing again. Multiple browser tabs can also overwrite each other's changes.

## Data and backups

```text
data/
├── index.json                 # { "weeks": [{ "startDate", "endDate" }] }
└── weeks/
    └── 2026-08-31.json         # Named after Monday; one file per week
```

A week has `startDate`, `endDate`, `focus`, seven `days`, and `summary`. Each day has `date`, `tasks`, and `note`; tasks have stable `id`, `text`, and `done` fields. See the [skill's data contract](skills/weekly-todo/SKILL.md#data-contract) for details.

Git ignores `data/`: **pushing code does not back up your journal**. Back up the entire directory separately. Stop the server and close editing pages before restoring a backup. After manual or agent edits, run `npm run check` and refresh the browser.

The server listens on `127.0.0.1` by default and has no authentication. It is intended for local personal use. Publishing the source on GitHub does not create a hosted app. Do not expose its data API directly to the public internet.

## Development and feedback

Plain HTML / CSS / JavaScript with Node.js built-in HTTP and filesystem modules. No build step.

```bash
npm run check   # Validate the local index and its referenced week files
npm test        # Test storage and validation using temporary data
```

Bug reports and focused improvements are welcome in [Issues](https://github.com/LittleSunflower333/weekly-todo-journal/issues). Include reproduction steps and browser / Node.js versions; replace private records with fictional examples. Keep changes aligned with local-first storage, readable JSON, and the simple weekly planner layout.

If Weekly helps you, a Star is appreciated.

## License

[MIT](LICENSE) · Copyright © 2026 LittleSunflower333
