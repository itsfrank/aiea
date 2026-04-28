import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { getInboxItemDisplayLabel, listInboxItems, markInboxItemDone } from "../lib/inbox.js";
import { getDailyPlanPath } from "../lib/paths.js";
import { getDateKey, markDayPlanItemDone, readDayPlan } from "../lib/plans.js";

function itemSearchText(item: Awaited<ReturnType<typeof listInboxItems>>[number], items: Awaited<ReturnType<typeof listInboxItems>>): string {
  return `${item.id}\t${getInboxItemDisplayLabel(item, items)}`;
}

async function selectWithFzf(lines: string[]): Promise<string | undefined> {
  const command = process.env.EA_FZF_COMMAND?.trim() || "fzf";
  const child = spawn(command, [], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  child.stdin.end(`${lines.join("\n")}\n`);

  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });

  const code = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("fzf is required when no exact item is selected. Install fzf or pass an item ID/query.");
    }
    throw error;
  });

  if (code !== 0) {
    return undefined;
  }
  return stdout.trim().split("\n").at(-1)?.trim() || undefined;
}

function findByQuery(query: string, lines: string[]): string[] {
  const normalized = query.toLowerCase();
  return lines.filter((line) => line.toLowerCase().includes(normalized));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function runDoneCommand(args: string[]): Promise<number> {
  const items = await listInboxItems();
  if (items.length === 0) {
    console.log("No open inbox items.");
    return 0;
  }

  const lines = items.map((item) => itemSearchText(item, items));
  const query = args.join(" ").trim();
  let selectedLine: string | undefined;

  if (query) {
    const exactId = items.find((item) => item.id === query);
    if (exactId) {
      selectedLine = itemSearchText(exactId, items);
    } else {
      const matches = findByQuery(query, lines);
      if (matches.length === 1) {
        selectedLine = matches[0];
      } else if (matches.length > 1) {
        selectedLine = await selectWithFzf(matches);
      } else {
        console.error(`No open inbox item matched: ${query}`);
        return 1;
      }
    }
  } else {
    selectedLine = await selectWithFzf(lines);
  }

  if (!selectedLine) {
    console.log("No item selected.");
    return 1;
  }

  const id = selectedLine.split("\t", 1)[0]?.trim();
  if (!id) {
    console.error("Could not determine selected item ID.");
    return 1;
  }

  const todayDate = getDateKey();
  const today = (await pathExists(getDailyPlanPath(todayDate))) ? await readDayPlan(todayDate) : undefined;
  const plannedToday = today?.scheduled.some((item) => item.sourceId === id) ?? false;
  const item = plannedToday && today ? (await markDayPlanItemDone(id, today.date)).item : await markInboxItemDone(id);
  console.log(`Marked done: ${item.text}`);
  return 0;
}
