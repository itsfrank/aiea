#!/usr/bin/env node

import { runAddCommand } from "./commands/add.js";
import { runConfigCommand } from "./commands/config.js";
import { runDoneCommand } from "./commands/done.js";
import { runInboxCommand } from "./commands/inbox.js";
import { runLaunchCommand } from "./commands/launch.js";
import { runNoteCommand } from "./commands/note.js";
import { runTodayCommand } from "./commands/today.js";

function printHelp(): void {
  console.log(`ea - terminal executive assistant

Usage:
  ea add <text>       Add a task, reminder, or note to the inbox
  ea note <text>      Add a note to review later
  ea inbox            Print open inbox items
  ea today            Print today's plan
  ea done [query|id]  Mark an inbox item done; uses fzf when no ID/query is provided
  ea config init      Create a default config.toml and print its path
  ea                  Launch the assistant in restricted mode

Examples:
  ea add "task: draft weekly plan"
  ea note "Remember that cloud import retries looked flaky"
  ea add "reminder: follow up with Sam"
  ea inbox
  ea today
  ea done
  ea`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, ...rest] = args;

  if (command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "add") {
    process.exit(await runAddCommand(rest));
  }

  if (command === "note") {
    process.exit(await runNoteCommand(rest));
  }

  if (command === "inbox") {
    process.exit(await runInboxCommand(rest));
  }

  if (command === "today") {
    process.exit(await runTodayCommand(rest));
  }

  if (command === "day") {
    console.error("`ea day` was renamed to `ea today`.");
    process.exit(1);
  }

  if (command === "done") {
    process.exit(await runDoneCommand(rest));
  }

  if (command === "config") {
    process.exit(await runConfigCommand(rest));
  }

  if (command === undefined) {
    process.exit(await runLaunchCommand([]));
  }

  process.exit(await runLaunchCommand(args));
}

void main();
