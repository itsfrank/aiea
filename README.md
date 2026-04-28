# EA

Minimal terminal executive assistant built on top of the pi coding agent harness.

## What it does

- `ea add "..."` appends a new item to `~/.ea/inbox.md`
- `ea note "..."` appends a note to `~/.ea/inbox.md` for later review
- `ea inbox` prints open inbox items
- `ea today` prints today's plan when one exists
- `ea done [query|id]` marks an inbox item done; with no argument it uses `fzf` to select an item
- `ea config init` creates a default config file and prints its path
- `ea` launches pi with a restrictive tool allowlist that exposes only EA inbox tools
- the assistant can add items, label long captures, defer items, promote items into day/week plans, add notes to scheduled day-plan items during morning review, find the latest previous plan after skipped days, carry unfinished items forward, remove items from today, and mark planned or inbox items done

## Install

Prerequisites:

- pi must be installed and configured. See pi's [Quick Start setup instructions](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent#quick-start).
- `fzf` is required for interactive `ea done` selection when no ID/query is provided.

```bash
npm install
npm run build
```

Run the CLI directly from source:

```bash
npm run ea -- --help
```

## Configuration

On launch, EA creates and reads user config from:

```text
~/.config/aiea/config.toml
```

Create the default config file:

```bash
ea config init
```

It prints the path where it wrote the file. To set the default pi model used by `ea`, uncomment/edit the sample model entry:

```toml
[pi]
# model = "openai/gpt-4o-mini"
```

CLI flags still win, so `ea --model sonnet:high` overrides the config file.

## Usage

Add a new inbox item:

```bash
npm run ea -- add "task: draft weekly plan"
npm run ea -- note "Cloud import retries looked flaky today"
npm run ea -- add "reminder: follow up with Sam"
npm run ea -- add "Maybe schedule dentist appointment"
npm run ea -- inbox
npm run ea -- today
npm run ea -- done
```

Launch the assistant:

```bash
npm run ea --
```

Inside the assistant:

- `/capture` adds a new inbox item
- `/morning` finds the latest previous day plan, records optional notes about what happened, reconciles unfinished items, and proposes today's plan
- `/today` reviews open inbox items and proposes today's plan

## Inbox format

Items are stored in `~/.ea/inbox.md` under dated sections.

Example:

```md
# Inbox

## 2026-04-21
- [ ] [id:20260421143210-ab12] 2026-04-21T14:32:10.000Z task: draft weekly plan
- [ ] [id:20260422202542-7964] 2026-04-22T20:25:42.613Z note: Need to figure out what is going on with cloud-import migration... [label:cloud-import migration]
```

The assistant prefers the short label in user-facing replies and keeps the full original capture text in the inbox file.

## Safety model

This app does not expose pi's default coding tools when launched through `ea`.

- allowed tools: `ea_inbox_add`, `ea_inbox_list`, `ea_inbox_set_label`, `ea_inbox_defer`, `ea_inbox_mark_done`, `ea_inbox_promote_to_day`, `ea_inbox_promote_to_week`, `ea_day_plan_read`, `ea_day_plan_find_latest_before`, `ea_day_plan_add_item_note`, `ea_day_plan_list_unfinished`, `ea_day_plan_mark_done`, `ea_day_plan_remove_item`, `ea_day_plan_carry_forward`, `ea_day_plan_write_priorities`, `ea_week_plan_read`, `ea_week_plan_write_priorities`
- no generic file tools
- no bash tool
- no arbitrary path input to the model

This is a restrictive application-level tool boundary, not an OS sandbox.
