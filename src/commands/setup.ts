import fs from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";

import JSON5 from "json5";

import {
  DEFAULT_AGENT_WORKSPACE_DIR,
  ensureAgentWorkspace,
} from "../agents/workspace.js";
import { type ClawdisConfig, CONFIG_PATH_CLAWDIS } from "../config/config.js";
import { resolveSessionTranscriptsDir } from "../config/sessions.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";

import { setupWizardCommand } from "./setup-wizard.js";

/** Options for the setup command */
export type SetupCommandOptions = {
  /** Agent workspace directory */
  workspace?: string;
  /** Run interactive wizard (default: true for TTY) */
  wizard?: boolean;
  /** Run quick non-interactive setup */
  quick?: boolean;
};

async function readConfigFileRaw(): Promise<{
  exists: boolean;
  parsed: ClawdisConfig;
}> {
  try {
    const raw = await fs.readFile(CONFIG_PATH_CLAWDIS, "utf-8");
    const parsed = JSON5.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { exists: true, parsed: parsed as ClawdisConfig };
    }
    return { exists: true, parsed: {} };
  } catch {
    return { exists: false, parsed: {} };
  }
}

async function writeConfigFile(cfg: ClawdisConfig) {
  await fs.mkdir(path.dirname(CONFIG_PATH_CLAWDIS), { recursive: true });
  const json = JSON.stringify(cfg, null, 2).trimEnd().concat("\n");
  await fs.writeFile(CONFIG_PATH_CLAWDIS, json, "utf-8");
}

/**
 * Quick (non-interactive) setup.
 * Creates config and workspace with defaults.
 */
async function runQuickSetup(
  opts?: { workspace?: string },
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const desiredWorkspace =
    typeof opts?.workspace === "string" && opts.workspace.trim()
      ? opts.workspace.trim()
      : undefined;

  const existingRaw = await readConfigFileRaw();
  const cfg = existingRaw.parsed;
  const agent = cfg.agent ?? {};

  const workspace =
    desiredWorkspace ?? agent.workspace ?? DEFAULT_AGENT_WORKSPACE_DIR;

  const next: ClawdisConfig = {
    ...cfg,
    agent: {
      ...agent,
      workspace,
    },
  };

  if (!existingRaw.exists || agent.workspace !== workspace) {
    await writeConfigFile(next);
    runtime.log(
      !existingRaw.exists
        ? `Wrote ${CONFIG_PATH_CLAWDIS}`
        : `Updated ${CONFIG_PATH_CLAWDIS} (set agent.workspace)`,
    );
  } else {
    runtime.log(`Config OK: ${CONFIG_PATH_CLAWDIS}`);
  }

  const ws = await ensureAgentWorkspace({
    dir: workspace,
    ensureBootstrapFiles: true,
  });
  runtime.log(`Workspace OK: ${ws.dir}`);

  const sessionsDir = resolveSessionTranscriptsDir();
  await fs.mkdir(sessionsDir, { recursive: true });
  runtime.log(`Sessions OK: ${sessionsDir}`);
}

/**
 * Check if running in a TTY (interactive terminal).
 */
function isTTY(): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY);
}

/**
 * Main setup command entry point.
 *
 * Behavior:
 * - --wizard: Force interactive wizard mode
 * - --quick: Force non-interactive quick setup
 * - Neither: Use wizard if TTY, otherwise quick
 */
export async function setupCommand(
  opts?: SetupCommandOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  // Determine mode
  const forceWizard = opts?.wizard === true;
  const forceQuick = opts?.quick === true;

  // --quick takes precedence over --wizard
  if (forceQuick) {
    await runQuickSetup({ workspace: opts?.workspace }, runtime);
    return;
  }

  // --wizard forces wizard mode
  if (forceWizard) {
    await setupWizardCommand({ workspace: opts?.workspace }, runtime);
    return;
  }

  // Default: wizard for TTY, quick otherwise
  if (isTTY()) {
    await setupWizardCommand({ workspace: opts?.workspace }, runtime);
  } else {
    await runQuickSetup({ workspace: opts?.workspace }, runtime);
  }
}
