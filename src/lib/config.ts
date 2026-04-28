import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface EaConfig {
  pi?: {
    model?: string;
    provider?: string;
  };
}

const DEFAULT_CONFIG = `# AIEA configuration

[pi]
# Default model used when launching pi via \`ea\`.
# Examples:
# model = "openai/gpt-4o-mini"
# model = "sonnet:high"
# provider = "anthropic"
# model = "claude-sonnet-4-5"
`;

export function getConfigPath(): string {
  return join(homedir(), ".config", "aiea", "config.toml");
}

function stripTomlComment(line: string): string {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (char === "#" && !inString) {
      return line.slice(0, index).trim();
    }
  }

  return line.trim();
}

function parseTomlString(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed || undefined;
}

export function parseEaConfig(content: string): EaConfig {
  const config: EaConfig = {};
  let section = "";

  for (const rawLine of content.split("\n")) {
    const line = stripTomlComment(rawLine);
    if (!line) {
      continue;
    }

    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    const assignmentMatch = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!assignmentMatch) {
      continue;
    }

    const [, key, rawValue] = assignmentMatch;
    const value = parseTomlString(rawValue);
    if (!value) {
      continue;
    }

    if (section === "pi" && (key === "model" || key === "provider")) {
      config.pi ??= {};
      config.pi[key] = value;
    }
  }

  return config;
}

export async function ensureConfigFile(): Promise<string> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    await writeFile(path, DEFAULT_CONFIG, "utf8");
    return DEFAULT_CONFIG;
  }
}

export async function readEaConfig(): Promise<EaConfig> {
  return parseEaConfig(await ensureConfigFile());
}
