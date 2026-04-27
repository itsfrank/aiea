# EA

Minimal terminal executive assistant built on top of the pi coding agent harness.

## What it does

- `ea add "..."` appends a new item to `~/.ea/inbox.md`
- `ea` launches pi with a restrictive tool allowlist that exposes only EA inbox tools
- the assistant can add items, label long captures, defer items, promote items into day/week plans, and mark inbox items done

## Install

```bash
npm install
npm run build
```

Run the CLI directly from source:

```bash
npm run ea -- --help
```

## Usage

Add a new inbox item:

```bash
npm run ea -- add "task: draft weekly plan"
npm run ea -- add "reminder: follow up with Sam"
npm run ea -- add "Maybe schedule dentist appointment"
```

Launch the assistant:

```bash
npm run ea --
```

Inside the assistant:

- `/capture` adds a new inbox item
- `/plan-day` reviews open inbox items and proposes today's plan
- `/plan-week` reviews open inbox items and proposes the week's plan

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

- allowed tools: `ea_inbox_add`, `ea_inbox_list`, `ea_inbox_set_label`, `ea_inbox_defer`, `ea_inbox_mark_done`, `ea_inbox_promote_to_day`, `ea_inbox_promote_to_week`, `ea_day_plan_read`, `ea_day_plan_write_priorities`, `ea_week_plan_read`, `ea_week_plan_write_priorities`
- no generic file tools
- no bash tool
- no arbitrary path input to the model

This is a restrictive application-level tool boundary, not an OS sandbox.
