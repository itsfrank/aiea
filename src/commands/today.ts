import { readFile } from "node:fs/promises";
import { getDailyPlanPath } from "../lib/paths.js";
import { getDateKey } from "../lib/plans.js";

function hasPlanItems(content: string): boolean {
  return content
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line.startsWith("- "));
}

export async function runTodayCommand(args: string[]): Promise<number> {
  if (args.length > 0) {
    console.error("Usage: ea today");
    return 1;
  }

  const date = getDateKey();
  const path = getDailyPlanPath(date);

  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    console.log(`No plan found for today (${date}). Run \`ea\` and use /morning to create today's plan.`);
    return 0;
  }

  if (!hasPlanItems(content)) {
    console.log(`Today's plan (${date}) is empty. Run \`ea\` and use /morning to build one.`);
    return 0;
  }

  process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
  return 0;
}
