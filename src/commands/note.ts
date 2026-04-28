import { addInboxItem } from "../lib/inbox.js";

export async function runNoteCommand(args: string[]): Promise<number> {
  const text = args.join(" ").trim();
  if (!text) {
    console.error('Usage: ea note "text"');
    return 1;
  }

  const item = await addInboxItem(`note: ${text}`);
  console.log(`Added note ${item.id}: ${item.text}`);
  return 0;
}
