import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function getEaHome(): string {
  const value = process.env.EA_HOME?.trim();
  if (!value) {
    return join(homedir(), ".ea");
  }
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return resolve(value);
}

export function getInboxPath(): string {
  return join(getEaHome(), "inbox.md");
}

export function getDailyPlansDir(): string {
  return join(getEaHome(), "daily");
}

export function getWeeklyPlansDir(): string {
  return join(getEaHome(), "weekly");
}

export function getDailyPlanPath(dateKey: string): string {
  return join(getDailyPlansDir(), `${dateKey}.md`);
}

export function getWeeklyPlanPath(weekKey: string): string {
  return join(getWeeklyPlansDir(), `${weekKey}.md`);
}

export async function ensureEaHome(): Promise<string> {
  const eaHome = getEaHome();
  await mkdir(eaHome, { recursive: true });
  return eaHome;
}

export async function ensureDailyPlansDir(): Promise<string> {
  const dir = getDailyPlansDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureWeeklyPlansDir(): Promise<string> {
  const dir = getWeeklyPlansDir();
  await mkdir(dir, { recursive: true });
  return dir;
}
