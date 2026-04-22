import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { ensureEaHome, getInboxPath } from "./paths.js";

export type InboxItemType = "task" | "reminder" | "note";

export interface InboxItem {
  id: string;
  done: boolean;
  timestamp: string;
  type: InboxItemType;
  text: string;
  reviewOn?: string;
  line: string;
}

const INBOX_HEADER = "# Inbox\n";
const itemPattern = /^- \[( |x)\] \[id:([^\]]+)\] ([^ ]+) (task|reminder|note): (.+)$/;
const reviewOnPattern = / \[review_on:(\d{4}-\d{2}-\d{2})\]$/;

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function createItemId(date: Date): string {
  const compact = date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${compact}-${randomBytes(2).toString("hex")}`;
}

function inferItemType(text: string): { type: InboxItemType; text: string } {
  const trimmed = text.trim();
  const match = /^(task|reminder|note):\s*(.+)$/i.exec(trimmed);
  if (!match) {
    return { type: "note", text: trimmed };
  }
  const [, rawType, body] = match;
  const normalizedType = rawType.toLowerCase() as InboxItemType;
  return { type: normalizedType, text: body.trim() };
}

function ensureHeader(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return `${INBOX_HEADER}\n`;
  }
  if (trimmed.startsWith("# Inbox")) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }
  return `${INBOX_HEADER}\n${trimmed}\n`;
}

function formatInboxLine(item: Pick<InboxItem, "id" | "done" | "timestamp" | "type" | "text" | "reviewOn">): string {
  const metadata = item.reviewOn ? ` [review_on:${item.reviewOn}]` : "";
  return `- [${item.done ? "x" : " "}] [id:${item.id}] ${item.timestamp} ${item.type}: ${item.text}${metadata}`;
}

function parseInboxLine(line: string): InboxItem | undefined {
  const match = itemPattern.exec(line);
  if (!match) {
    return undefined;
  }

  const [, doneFlag, id, timestamp, type, rawText] = match;
  const reviewOnMatch = reviewOnPattern.exec(rawText);
  const text = reviewOnMatch ? rawText.slice(0, reviewOnMatch.index).trimEnd() : rawText;

  return {
    id,
    done: doneFlag === "x",
    timestamp,
    type: type as InboxItemType,
    text,
    reviewOn: reviewOnMatch?.[1],
    line,
  };
}

async function readInboxFile(): Promise<string> {
  await ensureEaHome();
  const inboxPath = getInboxPath();
  try {
    return ensureHeader(await readFile(inboxPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    const initial = `${INBOX_HEADER}\n`;
    await writeFile(inboxPath, initial, "utf8");
    return initial;
  }
}

async function writeInboxFile(content: string): Promise<void> {
  await writeFile(getInboxPath(), ensureHeader(content), "utf8");
}

function insertItemIntoContent(content: string, dateKey: string, itemLine: string): string {
  const lines = ensureHeader(content).split("\n");
  const sectionHeading = `## ${dateKey}`;
  let sectionIndex = lines.findIndex((line) => line === sectionHeading);

  if (sectionIndex === -1) {
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(sectionHeading, itemLine, "");
    return `${lines.join("\n")}\n`;
  }

  let insertIndex = sectionIndex + 1;
  while (insertIndex < lines.length && !lines[insertIndex].startsWith("## ")) {
    insertIndex += 1;
  }
  while (insertIndex > sectionIndex + 1 && lines[insertIndex - 1] === "") {
    insertIndex -= 1;
  }
  lines.splice(insertIndex, 0, itemLine);
  return `${lines.join("\n")}\n`;
}

export async function addInboxItem(rawText: string, now = new Date()): Promise<InboxItem> {
  const { type, text } = inferItemType(rawText);
  if (!text) {
    throw new Error("Inbox item text cannot be empty.");
  }

  const timestamp = now.toISOString();
  const id = createItemId(now);
  const item: InboxItem = {
    id,
    done: false,
    timestamp,
    type,
    text,
    line: formatInboxLine({ id, done: false, timestamp, type, text }),
  };

  const content = await readInboxFile();
  const updated = insertItemIntoContent(content, formatDateKey(now), item.line);
  await writeInboxFile(updated);
  return item;
}

export async function listInboxItems(options: { includeDone?: boolean } = {}): Promise<InboxItem[]> {
  const content = await readInboxFile();
  const items: InboxItem[] = [];

  for (const line of content.split("\n")) {
    const item = parseInboxLine(line);
    if (!item) {
      continue;
    }
    if (!item.done || options.includeDone) {
      items.push(item);
    }
  }

  return items;
}

export async function getInboxItem(itemId: string): Promise<InboxItem> {
  const items = await listInboxItems({ includeDone: true });
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Inbox item not found: ${itemId}`);
  }
  return item;
}

export async function markInboxItemDone(itemId: string): Promise<InboxItem> {
  const content = await readInboxFile();
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const item = parseInboxLine(line);
    if (!item) {
      continue;
    }
    if (item.id !== itemId) {
      continue;
    }
    if (item.done) {
      return item;
    }
    const updatedItem: InboxItem = { ...item, done: true };
    const updatedLine = formatInboxLine(updatedItem);
    lines[index] = updatedLine;
    await writeInboxFile(`${lines.join("\n")}`);
    return { ...updatedItem, line: updatedLine };
  }

  throw new Error(`Inbox item not found: ${itemId}`);
}

export async function deferInboxItem(itemId: string, reviewOn: string): Promise<InboxItem> {
  const content = await readInboxFile();
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const item = parseInboxLine(lines[index]);
    if (!item || item.id !== itemId) {
      continue;
    }
    const updatedItem: InboxItem = { ...item, reviewOn };
    const updatedLine = formatInboxLine(updatedItem);
    lines[index] = updatedLine;
    await writeInboxFile(`${lines.join("\n")}`);
    return { ...updatedItem, line: updatedLine };
  }

  throw new Error(`Inbox item not found: ${itemId}`);
}

export async function ensureInboxExists(): Promise<void> {
  await readInboxFile();
}
