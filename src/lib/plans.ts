import { readdir, readFile, writeFile } from "node:fs/promises";
import {
  ensureDailyPlansDir,
  ensureWeeklyPlansDir,
  getDailyPlansDir,
  getDailyPlanPath,
  getWeeklyPlanPath,
} from "./paths.js";
import { getLocalDateKey, getLocalIsoWeekKey } from "./dates.js";
import { getInboxItem, getInboxItemBaseLabel, markInboxItemDone, type InboxItem } from "./inbox.js";

export interface ScheduledPlanItem {
  sourceId: string;
  done: boolean;
  type: InboxItem["type"];
  text: string;
  notes: string[];
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

const scheduledPattern = /^- \[( |x)\] \[from:([^\]]+)\] (task|reminder|note): (.+)$/;

function formatBulletSection(lines: string[]): string[] {
  return lines.length > 0 ? lines.map((line) => `- ${line}`) : [];
}

function formatScheduledSection(items: ScheduledPlanItem[]): string[] {
  return items.flatMap((item) => [
    `- [${item.done ? "x" : " "}] [from:${item.sourceId}] ${item.type}: ${item.text}`,
    ...item.notes.map((note) => `  - ${note}`),
  ]);
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
  let current: ScheduledPlanItem | undefined;

  for (const line of lines) {
    const match = scheduledPattern.exec(line.trim());
    if (match) {
      const [, doneFlag, sourceId, type, text] = match;
      current = { sourceId, done: doneFlag === "x", type: type as InboxItem["type"], text, notes: [] };
      items.push(current);
      continue;
    }

    const noteMatch = /^\s{2,}-\s+(.+)$/.exec(line);
    if (noteMatch && current) {
      current.notes.push(noteMatch[1].trim());
    }
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
  return getLocalDateKey(date);
}

export function getYesterdayDateKey(now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return getDateKey(yesterday);
}

export function getIsoWeekKey(date = new Date()): string {
  return getLocalIsoWeekKey(date);
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
    scheduled: [
      ...plan.scheduled,
      { sourceId: itemId, done: inboxItem.done, type: inboxItem.type, text: getInboxItemBaseLabel(inboxItem), notes: [] },
    ],
  };
  await writeFile(next.path, formatDayPlan(next), "utf8");
  return next;
}

export async function markDayPlanItemDone(itemId: string, date = getDateKey()): Promise<{ plan: DayPlan; item: ScheduledPlanItem }> {
  const plan = await readDayPlan(date);
  const scheduledItem = plan.scheduled.find((item) => item.sourceId === itemId);
  if (!scheduledItem) {
    throw new Error(`Day plan item not found for ${date}: ${itemId}`);
  }
  await markInboxItemDone(itemId);
  const next: DayPlan = {
    ...plan,
    scheduled: plan.scheduled.map((item) => (item.sourceId === itemId ? { ...item, done: true } : item)),
  };
  await writeFile(next.path, formatDayPlan(next), "utf8");
  return { plan: next, item: { ...scheduledItem, done: true } };
}

export async function removeInboxItemFromDayPlan(itemId: string, date = getDateKey()): Promise<DayPlan> {
  const plan = await readDayPlan(date);
  const next: DayPlan = {
    ...plan,
    scheduled: plan.scheduled.filter((item) => item.sourceId !== itemId),
  };
  if (next.scheduled.length === plan.scheduled.length) {
    throw new Error(`Day plan item not found for ${date}: ${itemId}`);
  }
  await writeFile(next.path, formatDayPlan(next), "utf8");
  return next;
}

export async function listUnfinishedDayPlanItems(date = getDateKey()): Promise<ScheduledPlanItem[]> {
  const plan = await readDayPlan(date);
  return plan.scheduled.filter((item) => !item.done);
}

export async function addDayPlanItemNote(itemId: string, note: string, date = getDateKey()): Promise<{ plan: DayPlan; item: ScheduledPlanItem }> {
  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("Note cannot be empty");
  }
  const plan = await readDayPlan(date);
  const scheduledItem = plan.scheduled.find((item) => item.sourceId === itemId);
  if (!scheduledItem) {
    throw new Error(`Day plan item not found for ${date}: ${itemId}`);
  }
  const next: DayPlan = {
    ...plan,
    scheduled: plan.scheduled.map((item) => (item.sourceId === itemId ? { ...item, notes: [...item.notes, trimmed] } : item)),
  };
  await writeFile(next.path, formatDayPlan(next), "utf8");
  const item = next.scheduled.find((candidate) => candidate.sourceId === itemId);
  if (!item) {
    throw new Error(`Day plan item not found for ${date}: ${itemId}`);
  }
  return { plan: next, item };
}

export async function findLatestDayPlanBefore(date = getDateKey(), lookbackDays = 14): Promise<DayPlan | undefined> {
  await ensureDailyPlansDir();
  const entries = await readdir(getDailyPlansDir());
  const candidateDates = entries
    .map((entry) => /^(\d{4}-\d{2}-\d{2})\.md$/.exec(entry)?.[1])
    .filter((entryDate): entryDate is string => typeof entryDate === "string" && entryDate < date)
    .sort((a, b) => b.localeCompare(a));

  const earliest = new Date(`${date}T00:00:00`);
  earliest.setDate(earliest.getDate() - lookbackDays);
  const earliestKey = getDateKey(earliest);

  for (const candidateDate of candidateDates) {
    if (candidateDate < earliestKey) {
      break;
    }
    const plan = await readDayPlan(candidateDate);
    if (plan.scheduled.length > 0) {
      return plan;
    }
  }
  return undefined;
}

export async function carryDayPlanItemForward(
  itemId: string,
  fromDate = getYesterdayDateKey(),
  toDate = getDateKey(),
): Promise<{ from: DayPlan; to: DayPlan; item: ScheduledPlanItem }> {
  const from = await readDayPlan(fromDate);
  const item = from.scheduled.find((candidate) => candidate.sourceId === itemId);
  if (!item) {
    throw new Error(`Day plan item not found for ${fromDate}: ${itemId}`);
  }
  const to = await addInboxItemToDayPlan(itemId, toDate);
  return { from, to, item };
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
    scheduled: [
      ...plan.scheduled,
      { sourceId: itemId, done: inboxItem.done, type: inboxItem.type, text: getInboxItemBaseLabel(inboxItem), notes: [] },
    ],
  };
  await writeFile(next.path, formatWeekPlan(next), "utf8");
  return next;
}
