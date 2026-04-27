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
  label?: string;
  reviewOn?: string;
  line: string;
}

const INBOX_HEADER = "# Inbox\n";
const itemPattern = /^- \[( |x)\] \[id:([^\]]+)\] ([^ ]+) (task|reminder|note): (.+)$/;
const labelPattern = / \[label:([^\]]+)\]/;
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

function formatTimestampContext(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp);
  const sameDay = date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const isYesterday = date.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
  const time = date.toISOString().slice(11, 19);

  if (sameDay) {
    return `captured today at ${time}`;
  }
  if (isYesterday) {
    return `captured yesterday at ${time}`;
  }
  return `captured ${date.toISOString().slice(0, 10)} at ${time}`;
}

function formatInboxLine(item: Pick<InboxItem, "id" | "done" | "timestamp" | "type" | "text" | "label" | "reviewOn">): string {
  const metadata: string[] = [];
  if (item.label) {
    metadata.push(`[label:${item.label}]`);
  }
  if (item.reviewOn) {
    metadata.push(`[review_on:${item.reviewOn}]`);
  }
  const suffix = metadata.length > 0 ? ` ${metadata.join(" ")}` : "";
  return `- [${item.done ? "x" : " "}] [id:${item.id}] ${item.timestamp} ${item.type}: ${item.text}${suffix}`;
}

function parseInboxLine(line: string): InboxItem | undefined {
  const match = itemPattern.exec(line);
  if (!match) {
    return undefined;
  }

  const [, doneFlag, id, timestamp, type, rawText] = match;
  const labelMatch = labelPattern.exec(rawText);
  const withoutLabel = labelMatch
    ? `${rawText.slice(0, labelMatch.index)}${rawText.slice(labelMatch.index + labelMatch[0].length)}`.trimEnd()
    : rawText;
  const reviewOnMatch = reviewOnPattern.exec(withoutLabel);
  const text = reviewOnMatch ? withoutLabel.slice(0, reviewOnMatch.index).trimEnd() : withoutLabel;

  return {
    id,
    done: doneFlag === "x",
    timestamp,
    type: type as InboxItemType,
    text,
    label: labelMatch?.[1],
    reviewOn: reviewOnMatch?.[1],
    line,
  };
}

export function getInboxItemBaseLabel(item: Pick<InboxItem, "text" | "label">): string {
  return item.label?.trim() || item.text.trim();
}

export function getInboxItemDisplayLabel(
  item: Pick<InboxItem, "id" | "text" | "label" | "type" | "timestamp" | "reviewOn">,
  peers: Array<Pick<InboxItem, "id" | "text" | "label" | "type" | "timestamp" | "reviewOn">>,
  now = new Date(),
): string {
  const base = getInboxItemBaseLabel(item);
  const qualifiers: string[] = [];

  if (item.reviewOn) {
    qualifiers.push(`review on ${item.reviewOn}`);
  }

  const duplicateBaseCount = peers.filter((peer) => getInboxItemBaseLabel(peer) === base).length;
  if (duplicateBaseCount > 1) {
    qualifiers.push(formatTimestampContext(item.timestamp, now));
  }

  let display = qualifiers.length > 0 ? `${base} (${qualifiers.join(", ")})` : base;

  const duplicateDisplayCount = peers.filter((peer) => {
    const peerBase = getInboxItemBaseLabel(peer);
    const peerQualifiers: string[] = [];
    if (peer.reviewOn) {
      peerQualifiers.push(`review on ${peer.reviewOn}`);
    }
    if (duplicateBaseCount > 1) {
      peerQualifiers.push(formatTimestampContext(peer.timestamp, now));
    }
    const peerDisplay = peerQualifiers.length > 0 ? `${peerBase} (${peerQualifiers.join(", ")})` : peerBase;
    return peerDisplay === display;
  }).length;

  if (duplicateDisplayCount > 1) {
    display = `${display} (${item.type}, #${item.id.slice(-4)})`;
  }

  return display;
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

export async function setInboxItemLabel(itemId: string, label: string): Promise<InboxItem> {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    throw new Error("Inbox item label cannot be empty.");
  }

  const content = await readInboxFile();
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const item = parseInboxLine(lines[index]);
    if (!item || item.id !== itemId) {
      continue;
    }
    const updatedItem: InboxItem = { ...item, label: trimmedLabel };
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
