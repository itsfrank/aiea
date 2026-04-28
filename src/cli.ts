#!/usr/bin/env node

import { runAddCommand } from "./commands/add.js";
import { runDoneCommand } from "./commands/done.js";
import { runInboxCommand } from "./commands/inbox.js";
import { runLaunchCommand } from "./commands/launch.js";
import { runTodayCommand } from "./commands/today.js";

function printHelp(): void {
  console.log(`ea - terminal executive assistant

Usage:
  ea add <text>       Add a task, reminder, or note to the inbox
  ea inbox            Print open inbox items
  ea today            Print today's plan
  ea done [query|id]  Mark an inbox item done; uses fzf when no ID/query is provided
  ea                  Launch the assistant in restricted mode

Examples:
  ea add "task: draft weekly plan"
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

  if (command === undefined) {
    process.exit(await runLaunchCommand([]));
  }

  process.exit(await runLaunchCommand(args));
}

void main();
