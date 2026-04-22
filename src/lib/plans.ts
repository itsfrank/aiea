import { readFile, writeFile } from "node:fs/promises";
import {
  ensureDailyPlansDir,
  ensureWeeklyPlansDir,
  getDailyPlanPath,
  getWeeklyPlanPath,
} from "./paths.js";
import { getInboxItem, type InboxItem } from "./inbox.js";

export interface ScheduledPlanItem {
  sourceId: string;
  type: InboxItem["type"];
  text: string;
}

export interface DayPlan {
  date: string;
  priorities: string[];
  scheduled: ScheduledPlanItem[];
  notes: string[];
  path: string;
}

export interface WeekPlan {
  week: string;
  priorities: string[];
  scheduled: ScheduledPlanItem[];
  notes: string[];
  path: string;
}

const scheduledPattern = /^- \[ \] \[from:([^\]]+)\] (task|reminder|note): (.+)$/;

function formatBulletSection(lines: string[]): string[] {
  return lines.length > 0 ? lines.map((line) => `- ${line}`) : [];
}

function formatScheduledSection(items: ScheduledPlanItem[]): string[] {
  return items.map((item) => `- [ ] [from:${item.sourceId}] ${item.type}: ${item.text}`);
}

function collectBulletItems(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

function collectScheduledItems(lines: string[]): ScheduledPlanItem[] {
  const items: ScheduledPlanItem[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const match = scheduledPattern.exec(trimmed);
    if (!match) {
      continue;
    }
    const [, sourceId, type, text] = match;
    items.push({ sourceId, type: type as InboxItem["type"], text });
  }
  return items;
}

function readSections(content: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current = "";

  for (const line of content.split("\n")) {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      sections.set(current, []);
      continue;
    }
    if (!current) {
      continue;
    }
    sections.get(current)?.push(line);
  }

  return sections;
}

function formatDayPlan(plan: Omit<DayPlan, "path">): string {
  return [
    "# Day Plan",
    `Date: ${plan.date}`,
    "",
    "## Priorities",
    ...formatBulletSection(plan.priorities),
    "",
    "## Scheduled From Inbox",
    ...formatScheduledSection(plan.scheduled),
    "",
    "## Notes",
    ...formatBulletSection(plan.notes),
    "",
  ].join("\n");
}

function formatWeekPlan(plan: Omit<WeekPlan, "path">): string {
  return [
    "# Week Plan",
    `Week: ${plan.week}`,
    "",
    "## Priorities",
    ...formatBulletSection(plan.priorities),
    "",
    "## Scheduled From Inbox",
    ...formatScheduledSection(plan.scheduled),
    "",
    "## Notes",
    ...formatBulletSection(plan.notes),
    "",
  ].join("\n");
}

async function ensurePlanFile(path: string, initialContent: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    await writeFile(path, initialContent, "utf8");
    return initialContent;
  }
}

export function getDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getIsoWeekKey(date = new Date()): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function readDayPlan(date = getDateKey()): Promise<DayPlan> {
  await ensureDailyPlansDir();
  const path = getDailyPlanPath(date);
  const content = await ensurePlanFile(path, formatDayPlan({ date, priorities: [], scheduled: [], notes: [] }));
  const sections = readSections(content);
  return {
    date,
    priorities: collectBulletItems(sections.get("Priorities") ?? []),
    scheduled: collectScheduledItems(sections.get("Scheduled From Inbox") ?? []),
    notes: collectBulletItems(sections.get("Notes") ?? []),
    path,
  };
}

export async function writeDayPlanPriorities(date: string, priorities: string[]): Promise<DayPlan> {
  const existing = await readDayPlan(date);
  const next: DayPlan = { ...existing, priorities: priorities.map((value) => value.trim()).filter(Boolean) };
  await writeFile(next.path, formatDayPlan(next), "utf8");
  return next;
}

export async function addInboxItemToDayPlan(itemId: string, date = getDateKey()): Promise<DayPlan> {
  const plan = await readDayPlan(date);
  if (plan.scheduled.some((item) => item.sourceId === itemId)) {
    return plan;
  }
  const inboxItem = await getInboxItem(itemId);
  const next: DayPlan = {
    ...plan,
    scheduled: [...plan.scheduled, { sourceId: itemId, type: inboxItem.type, text: inboxItem.text }],
  };
  await writeFile(next.path, formatDayPlan(next), "utf8");
  return next;
}

export async function readWeekPlan(week = getIsoWeekKey()): Promise<WeekPlan> {
  await ensureWeeklyPlansDir();
  const path = getWeeklyPlanPath(week);
  const content = await ensurePlanFile(path, formatWeekPlan({ week, priorities: [], scheduled: [], notes: [] }));
  const sections = readSections(content);
  return {
    week,
    priorities: collectBulletItems(sections.get("Priorities") ?? []),
    scheduled: collectScheduledItems(sections.get("Scheduled From Inbox") ?? []),
    notes: collectBulletItems(sections.get("Notes") ?? []),
    path,
  };
}

export async function writeWeekPlanPriorities(week: string, priorities: string[]): Promise<WeekPlan> {
  const existing = await readWeekPlan(week);
  const next: WeekPlan = { ...existing, priorities: priorities.map((value) => value.trim()).filter(Boolean) };
  await writeFile(next.path, formatWeekPlan(next), "utf8");
  return next;
}

export async function addInboxItemToWeekPlan(itemId: string, week = getIsoWeekKey()): Promise<WeekPlan> {
  const plan = await readWeekPlan(week);
  if (plan.scheduled.some((item) => item.sourceId === itemId)) {
    return plan;
  }
  const inboxItem = await getInboxItem(itemId);
  const next: WeekPlan = {
    ...plan,
    scheduled: [...plan.scheduled, { sourceId: itemId, type: inboxItem.type, text: inboxItem.text }],
  };
  await writeFile(next.path, formatWeekPlan(next), "utf8");
  return next;
}
