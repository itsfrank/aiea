import { initConfigFile } from "../lib/config.js";

export async function runConfigCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;

  if (subcommand !== "init" || rest.length > 0) {
    console.error("Usage: ea config init");
    return 1;
  }

  const path = await initConfigFile();
  console.log(path);
  return 0;
}
