import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureInboxExists } from "../lib/inbox.js";
import { getEaHome } from "../lib/paths.js";

const TOOL_ALLOWLIST = [
  "ea_inbox_add",
  "ea_inbox_list",
  "ea_inbox_mark_done",
  "ea_inbox_defer",
  "ea_inbox_promote_to_day",
  "ea_inbox_promote_to_week",
  "ea_day_plan_read",
  "ea_day_plan_write_priorities",
  "ea_week_plan_read",
  "ea_week_plan_write_priorities",
].join(",");

function getPackageRoot(): string {
  return resolve(fileURLToPath(new URL("../..", import.meta.url)));
}

function getExtensionPath(): string {
  return join(getPackageRoot(), "extensions", "ea", "index.ts");
}

function getPiCliPath(): string {
  return join(getPackageRoot(), "node_modules", "@mariozechner", "pi-coding-agent", "dist", "cli.js");
}

export async function runLaunchCommand(args: string[]): Promise<number> {
  await ensureInboxExists();
  const eaHome = getEaHome();
  const child = spawn(
    process.execPath,
    [
      getPiCliPath(),
      "--extension",
      getExtensionPath(),
      "--tools",
      TOOL_ALLOWLIST,
      "--no-extensions",
      "--no-skills",
      "--no-themes",
      "--no-context-files",
      ...args,
    ],
    {
      stdio: "inherit",
      cwd: eaHome,
      env: process.env,
    },
  );

  return await new Promise<number>((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}
