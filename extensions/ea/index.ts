import type { BuildSystemPromptOptions, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  addInboxItem,
  deferInboxItem,
  getInboxItemDisplayLabel,
  listInboxItems,
  markInboxItemDone,
  setInboxItemLabel,
} from "../../src/lib/inbox.js";
import {
  addInboxItemToDayPlan,
  addInboxItemToWeekPlan,
  getDateKey,
  getIsoWeekKey,
  readDayPlan,
  readWeekPlan,
  writeDayPlanPriorities,
  writeWeekPlanPriorities,
} from "../../src/lib/plans.js";

function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const date = getDateKey();
  const cwd = options.cwd.replace(/\\/g, "/");
  return `You are an executive assistant running inside a restricted pi harness.

Your job is to help the user capture, review, prioritize, schedule, and close personal work items.

Rules:
- You only have access to EA-specific inbox and planning tools.
- Do not assume access to any files or commands outside the EA tool surface.
- The inbox is the source of truth for intake.
- Review open inbox items before proposing a plan.
- Use day and week plan tools to turn inbox items into concrete plans.
- Mark items done only when the user clearly confirms completion or the conversation has clearly resolved the item.
- Use human-readable task names in replies. Use item IDs only for tool calls or when disambiguation is unavoidable.
- When an inbox capture is too long or messy, create a short label during triage and use that label in user-facing replies.
- Be concise and practical.

Available memory:
- Inbox file: ~/.ea/inbox.md
- Daily plans: ~/.ea/daily/YYYY-MM-DD.md
- Weekly plans: ~/.ea/weekly/YYYY-Www.md

Working style:
- Suggest priorities, next actions, and short plans.
- When useful, ask the user whether an item should stay open, be deferred, promoted into a plan, or be marked done.

Current date: ${date}
Current working directory: ${cwd}`;
}

function formatInboxListText(items: Awaited<ReturnType<typeof listInboxItems>>): string {
  if (items.length === 0) {
    return "No inbox items.";
  }
  return items
    .map((item) => `- [${item.done ? "x" : " "}] ${getInboxItemDisplayLabel(item, items)}`)
    .join("\n");
}

async function promptForCapture(args: string, ctx: ExtensionContext): Promise<string | undefined> {
  const trimmed = args.trim();
  if (trimmed) {
    return trimmed;
  }
  if (!ctx.hasUI) {
    return undefined;
  }
  return (await ctx.ui.editor("Capture inbox item", ""))?.trim();
}

export default function eaExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ea_inbox_add",
    label: "EA Inbox Add",
    description: "Add a new inbox item. Prefix text with task:, reminder:, or note: when useful.",
    parameters: Type.Object({
      text: Type.String({ description: "Inbox item text" }),
    }),
    async execute(_toolCallId, params) {
      const item = await addInboxItem(params.text);
      return {
        content: [{ type: "text", text: `Added ${item.type}: ${getInboxItemDisplayLabel(item, [item])}` }],
        details: item,
      };
    },
  });

  pi.registerTool({
    name: "ea_inbox_list",
    label: "EA Inbox List",
    description: "List inbox items. Use includeDone=true only when you need closed items too.",
    parameters: Type.Object({
      includeDone: Type.Optional(Type.Boolean({ description: "Include completed inbox items" })),
    }),
    async execute(_toolCallId, params) {
      const items = await listInboxItems({ includeDone: params.includeDone ?? false });
      return {
        content: [{ type: "text", text: formatInboxListText(items) }],
        details: { items },
      };
    },
  });

  pi.registerTool({
    name: "ea_inbox_defer",
    label: "EA Inbox Defer",
    description: "Set a future review date for an inbox item by ID.",
    parameters: Type.Object({
      id: Type.String({ description: "Inbox item ID" }),
      reviewOn: Type.String({ description: "Review date in YYYY-MM-DD format" }),
    }),
    async execute(_toolCallId, params) {
      const item = await deferInboxItem(params.id, params.reviewOn);
      return {
        content: [{ type: "text", text: `Deferred ${getInboxItemDisplayLabel(item, [item])}` }],
        details: item,
      };
    },
  });

  pi.registerTool({
    name: "ea_inbox_set_label",
    label: "EA Inbox Label",
    description: "Set a short human-readable label for an inbox item by ID.",
    parameters: Type.Object({
      id: Type.String({ description: "Inbox item ID" }),
      label: Type.String({ description: "Short label for the inbox item" }),
    }),
    async execute(_toolCallId, params) {
      const item = await setInboxItemLabel(params.id, params.label);
      return {
        content: [{ type: "text", text: `Set label: ${getInboxItemDisplayLabel(item, [item])}` }],
        details: item,
      };
    },
  });

  pi.registerTool({
    name: "ea_inbox_mark_done",
    label: "EA Inbox Done",
    description: "Mark an inbox item done by its item ID.",
    parameters: Type.Object({
      id: Type.String({ description: "Inbox item ID" }),
    }),
    async execute(_toolCallId, params) {
      const item = await markInboxItemDone(params.id);
      return {
        content: [{ type: "text", text: `Marked done: ${getInboxItemDisplayLabel(item, [item])}` }],
        details: item,
      };
    },
  });

  pi.registerTool({
    name: "ea_inbox_promote_to_day",
    label: "EA Promote To Day",
    description: "Copy an inbox item into the day's scheduled section.",
    parameters: Type.Object({
      id: Type.String({ description: "Inbox item ID" }),
      date: Type.Optional(Type.String({ description: "Target date in YYYY-MM-DD format" })),
    }),
    async execute(_toolCallId, params) {
      const plan = await addInboxItemToDayPlan(params.id, params.date ?? getDateKey());
      const promoted = plan.scheduled.find((item) => item.sourceId === params.id);
      return {
        content: [{ type: "text", text: `Promoted ${promoted?.text ?? "item"} into day plan ${plan.date}` }],
        details: plan,
      };
    },
  });

  pi.registerTool({
    name: "ea_inbox_promote_to_week",
    label: "EA Promote To Week",
    description: "Copy an inbox item into the week's scheduled section.",
    parameters: Type.Object({
      id: Type.String({ description: "Inbox item ID" }),
      week: Type.Optional(Type.String({ description: "Target week in YYYY-Www format" })),
    }),
    async execute(_toolCallId, params) {
      const plan = await addInboxItemToWeekPlan(params.id, params.week ?? getIsoWeekKey());
      const promoted = plan.scheduled.find((item) => item.sourceId === params.id);
      return {
        content: [{ type: "text", text: `Promoted ${promoted?.text ?? "item"} into week plan ${plan.week}` }],
        details: plan,
      };
    },
  });

  pi.registerTool({
    name: "ea_day_plan_read",
    label: "EA Day Plan Read",
    description: "Read the day plan for a date.",
    parameters: Type.Object({
      date: Type.Optional(Type.String({ description: "Date in YYYY-MM-DD format" })),
    }),
    async execute(_toolCallId, params) {
      const plan = await readDayPlan(params.date ?? getDateKey());
      const text = [
        `Day plan ${plan.date}`,
        `Priorities: ${plan.priorities.length ? plan.priorities.join(" | ") : "(none)"}`,
        `Scheduled: ${plan.scheduled.length ? plan.scheduled.map((item) => item.text).join(" | ") : "(none)"}`,
      ].join("\n");
      return {
        content: [{ type: "text", text }],
        details: plan,
      };
    },
  });

  pi.registerTool({
    name: "ea_day_plan_write_priorities",
    label: "EA Day Plan Priorities",
    description: "Replace the priorities section for a day plan.",
    parameters: Type.Object({
      date: Type.Optional(Type.String({ description: "Date in YYYY-MM-DD format" })),
      priorities: Type.Array(Type.String({ description: "Priority line" })),
    }),
    async execute(_toolCallId, params) {
      const plan = await writeDayPlanPriorities(params.date ?? getDateKey(), params.priorities);
      return {
        content: [{ type: "text", text: `Updated priorities for day plan ${plan.date}` }],
        details: plan,
      };
    },
  });

  pi.registerTool({
    name: "ea_week_plan_read",
    label: "EA Week Plan Read",
    description: "Read the week plan for a week key.",
    parameters: Type.Object({
      week: Type.Optional(Type.String({ description: "Week key in YYYY-Www format" })),
    }),
    async execute(_toolCallId, params) {
      const plan = await readWeekPlan(params.week ?? getIsoWeekKey());
      const text = [
        `Week plan ${plan.week}`,
        `Priorities: ${plan.priorities.length ? plan.priorities.join(" | ") : "(none)"}`,
        `Scheduled: ${plan.scheduled.length ? plan.scheduled.map((item) => item.text).join(" | ") : "(none)"}`,
      ].join("\n");
      return {
        content: [{ type: "text", text }],
        details: plan,
      };
    },
  });

  pi.registerTool({
    name: "ea_week_plan_write_priorities",
    label: "EA Week Plan Priorities",
    description: "Replace the priorities section for a week plan.",
    parameters: Type.Object({
      week: Type.Optional(Type.String({ description: "Week key in YYYY-Www format" })),
      priorities: Type.Array(Type.String({ description: "Priority line" })),
    }),
    async execute(_toolCallId, params) {
      const plan = await writeWeekPlanPriorities(params.week ?? getIsoWeekKey(), params.priorities);
      return {
        content: [{ type: "text", text: `Updated priorities for week plan ${plan.week}` }],
        details: plan,
      };
    },
  });

  pi.registerCommand("capture", {
    description: "Capture a new inbox item",
    handler: async (args, ctx) => {
      const text = await promptForCapture(args, ctx);
      if (!text) {
        if (ctx.hasUI) {
          ctx.ui.notify("Capture cancelled", "info");
        }
        return;
      }
      const item = await addInboxItem(text);
      if (ctx.hasUI) {
        ctx.ui.notify(`Added ${item.type}: ${getInboxItemDisplayLabel(item, [item])}`, "success");
      }
    },
  });

  pi.registerCommand("inbox", {
    description: "Review open inbox items and suggest triage actions",
    handler: async () => {
      pi.sendUserMessage(
        "Review the open inbox items, highlight anything deferred for review, and suggest the next triage actions. When an inbox capture is too long or messy, create a short label for it. Use human-readable task names in your reply. Use item IDs only for tool calls or if disambiguation is unavoidable.",
      );
    },
  });

  pi.registerCommand("plan-day", {
    description: "Review inbox and propose today's priorities",
    handler: async () => {
      pi.sendUserMessage(
        "Review the open inbox items and today's day plan. Identify the most important items for today, write a concise priorities section for the day plan when helpful, and promote specific inbox items into today's scheduled section when they belong there. Use human-readable task names in your reply. Use item IDs only for tool calls or if disambiguation is unavoidable.",
      );
    },
  });

  pi.registerCommand("plan-week", {
    description: "Review inbox and propose this week's priorities",
    handler: async () => {
      pi.sendUserMessage(
        "Review the open inbox items and the current week plan. Group work into this week's priorities, write a concise priorities section for the week plan when helpful, and promote specific inbox items into this week's scheduled section when they belong there. Use human-readable task names in your reply. Use item IDs only for tool calls or if disambiguation is unavoidable.",
      );
    },
  });

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: buildSystemPrompt(event.systemPromptOptions),
  }));
}
