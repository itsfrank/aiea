#!/usr/bin/env node

import { runAddCommand } from "./commands/add.js";
import { runDayCommand } from "./commands/day.js";
import { runLaunchCommand } from "./commands/launch.js";

function printHelp(): void {
  console.log(`ea - terminal executive assistant

Usage:
  ea add <text>    Add a task, reminder, or note to the inbox
  ea day           Print today's plan
  ea               Launch the assistant in restricted mode

Examples:
  ea add "task: draft weekly plan"
  ea add "reminder: follow up with Sam"
  ea day
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

  if (command === "day") {
    process.exit(await runDayCommand(rest));
  }

  if (command === undefined) {
    process.exit(await runLaunchCommand([]));
  }

  process.exit(await runLaunchCommand(args));
}

void main();
