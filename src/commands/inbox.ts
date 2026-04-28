import { getInboxItemDisplayLabel, listInboxItems } from "../lib/inbox.js";

export async function runInboxCommand(args: string[]): Promise<number> {
  if (args.length > 0) {
    console.error("Usage: ea inbox");
    return 1;
  }

  const items = await listInboxItems();
  if (items.length === 0) {
    console.log("No open inbox items.");
    return 0;
  }

  for (const item of items) {
    console.log(`${item.id}\t${getInboxItemDisplayLabel(item, items)}`);
  }
  return 0;
}
