import { addInboxItem } from "../lib/inbox.js";

export async function runAddCommand(args: string[]): Promise<number> {
  const text = args.join(" ").trim();
  if (!text) {
    console.error('Usage: ea add "text"');
    return 1;
  }

  const item = await addInboxItem(text);
  console.log(`Added ${item.type} ${item.id}: ${item.text}`);
  return 0;
}
