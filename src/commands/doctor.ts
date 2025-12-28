/**
 * `clawdis doctor` command - diagnose system prerequisites and configuration.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";

import chalk from "chalk";

import {
  type PrerequisiteCheckResult,
  type PrerequisiteCheckSummary,
  runAllPrerequisiteChecks,
} from "../infra/prerequisites.js";
import { loginWeb } from "../provider-web.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { setupCommand } from "./setup.js";

export interface DoctorOptions {
  json?: boolean;
  verbose?: boolean;
  fix?: boolean;
}

/** Issues that can be automatically fixed */
type FixableIssue =
  | "setup-config"
  | "setup-workspace"
  | "whatsapp-login"
  | "anthropic-key";

/** Map prerequisite IDs to fixable issues */
function getFixId(id: string): FixableIssue | undefined {
  const mapping: Record<string, FixableIssue> = {
    "config-dir": "setup-config",
    "config-file": "setup-config",
    workspace: "setup-workspace",
  };
  return mapping[id];
}

const STATUS_ICONS: Record<string, string> = {
  ok: chalk.green("✓"),
  warning: chalk.yellow("!"),
  error: chalk.red("✗"),
  skipped: chalk.gray("○"),
};

const STATUS_COLORS: Record<string, (s: string) => string> = {
  ok: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  skipped: chalk.gray,
};

function formatResult(
  result: PrerequisiteCheckResult,
  verbose: boolean,
): string {
  const icon = STATUS_ICONS[result.status] || "?";
  const color = STATUS_COLORS[result.status] || ((s: string) => s);
  const name = chalk.bold(result.name.padEnd(22));
  const message = color(result.message);

  let line = `  ${icon} ${name} ${message}`;

  if (verbose && result.version) {
    line += chalk.gray(` (v${result.version})`);
  }

  return line;
}

function formatHint(result: PrerequisiteCheckResult): string | null {
  if (!result.fix) return null;
  return chalk.gray(`    └─ ${result.fix}`);
}

function formatSummary(report: PrerequisiteCheckSummary): string {
  const parts: string[] = [];

  if (report.passed > 0) parts.push(chalk.green(`${report.passed} passed`));
  if (report.warnings > 0)
    parts.push(chalk.yellow(`${report.warnings} warnings`));
  if (report.errors > 0) parts.push(chalk.red(`${report.errors} errors`));
  if (report.skipped > 0) parts.push(chalk.gray(`${report.skipped} skipped`));

  return parts.join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix Functions
// ─────────────────────────────────────────────────────────────────────────────

const FIX_DESCRIPTIONS: Record<FixableIssue, string> = {
  "setup-config": "Create config file (~/.clawdis/clawdis.json)",
  "setup-workspace": "Create agent workspace (~/clawd)",
  "whatsapp-login": "Link WhatsApp account (scan QR code)",
  "anthropic-key": "Configure Anthropic API key",
};

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer.startsWith("y");
}

async function promptForInput(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function applyFix(
  fixId: FixableIssue,
  runtime: RuntimeEnv,
): Promise<boolean> {
  switch (fixId) {
    case "setup-config":
    case "setup-workspace": {
      runtime.log(chalk.cyan("\n  Running clawdis setup...\n"));
      try {
        await setupCommand({}, runtime);
        return true;
      } catch (err) {
        runtime.log(chalk.red(`  Setup failed: ${(err as Error).message}`));
        return false;
      }
    }

    case "whatsapp-login": {
      runtime.log(chalk.cyan("\n  Starting WhatsApp login flow...\n"));
      runtime.log(chalk.gray("  Scan the QR code with your phone.\n"));
      try {
        await loginWeb(true, "whatsapp");
        return true;
      } catch (err) {
        runtime.log(chalk.red(`  Login failed: ${(err as Error).message}`));
        return false;
      }
    }

    case "anthropic-key": {
      runtime.log("");
      const apiKey = await promptForInput(
        chalk.cyan("  Enter your Anthropic API key: "),
      );
      if (!apiKey) {
        runtime.log(chalk.yellow("  Skipped - no key entered."));
        return false;
      }

      // Validate key format (should start with sk-ant-)
      if (!apiKey.startsWith("sk-ant-")) {
        runtime.log(
          chalk.yellow(
            "  Warning: Key doesn't match expected format (sk-ant-...).",
          ),
        );
        const proceed = await promptYesNo("  Save anyway?");
        if (!proceed) {
          return false;
        }
      }

      // Save to config file
      const configPath = path.join(os.homedir(), ".clawdis", "clawdis.json");
      try {
        // Ensure directory exists
        fs.mkdirSync(path.dirname(configPath), { recursive: true });

        // Load existing config or create new
        let config: Record<string, unknown> = {};
        try {
          const raw = fs.readFileSync(configPath, "utf-8");
          config = JSON.parse(raw);
        } catch {
          // File doesn't exist or is invalid
        }

        // Set the API key in agent section
        if (!config.agent || typeof config.agent !== "object") {
          config.agent = {};
        }
        (config.agent as Record<string, unknown>).anthropicApiKey = apiKey;

        // Write back
        fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
        runtime.log(chalk.green("  API key saved to config."));

        // Also suggest setting env var
        runtime.log(
          chalk.gray(
            "\n  Tip: You can also set ANTHROPIC_API_KEY in your shell profile.",
          ),
        );
        return true;
      } catch (err) {
        runtime.log(
          chalk.red(`  Failed to save config: ${(err as Error).message}`),
        );
        return false;
      }
    }

    default:
      return false;
  }
}

async function runFixes(
  report: PrerequisiteCheckSummary,
  runtime: RuntimeEnv,
): Promise<number> {
  // Collect fixable issues
  const fixable = report.checks.filter((r) => {
    const fixId = getFixId(r.id);
    return fixId && (r.status === "error" || r.status === "warning");
  });

  if (fixable.length === 0) {
    runtime.log(chalk.green("\n  No fixable issues found."));
    return 0;
  }

  runtime.log(chalk.bold.cyan("\n  Fixable Issues"));
  runtime.log(chalk.gray("  ─────────────────────────────────────────────\n"));

  // Deduplicate fixes (setup-config and setup-workspace are the same fix)
  const seenFixes = new Set<FixableIssue>();
  const uniqueFixable: PrerequisiteCheckResult[] = [];

  for (const result of fixable) {
    const fixId = getFixId(result.id);
    if (fixId && !seenFixes.has(fixId)) {
      // Merge setup-config and setup-workspace
      if (fixId === "setup-workspace" && seenFixes.has("setup-config")) {
        continue;
      }
      if (fixId === "setup-config" && seenFixes.has("setup-workspace")) {
        continue;
      }
      seenFixes.add(fixId);
      uniqueFixable.push(result);
    }
  }

  let fixed = 0;

  for (const result of uniqueFixable) {
    const fixId = getFixId(result.id);
    if (!fixId) continue;
    const description = FIX_DESCRIPTIONS[fixId];

    runtime.log(`  ${chalk.yellow("?")} ${chalk.bold(description)}`);

    const confirm = await promptYesNo("    Apply this fix?");

    if (confirm) {
      const success = await applyFix(fixId, runtime);
      if (success) {
        runtime.log(chalk.green("    ✓ Fixed!\n"));
        fixed++;
      } else {
        runtime.log(chalk.red("    ✗ Fix failed.\n"));
      }
    } else {
      runtime.log(chalk.gray("    ○ Skipped.\n"));
    }
  }

  return fixed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Command
// ─────────────────────────────────────────────────────────────────────────────

export async function doctorCommand(
  opts: DoctorOptions = {},
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const { json = false, verbose = false, fix = false } = opts;

  // Run all checks
  const report = await runAllPrerequisiteChecks();

  // JSON output mode
  if (json) {
    runtime.log(JSON.stringify(report, null, 2));
    if (report.errors > 0) {
      runtime.exit(1);
    }
    return;
  }

  // Pretty output
  runtime.log("");
  runtime.log(chalk.bold.cyan("  Clawdis Doctor"));
  runtime.log(chalk.gray("  ─────────────────────────────────────────────"));
  runtime.log("");

  // Group by category
  const categories = new Map<string, PrerequisiteCheckResult[]>();
  for (const result of report.checks) {
    const category = getCategoryForResult(result.name);
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)?.push(result);
  }

  const categoryOrder = ["Runtime", "Tools", "Configuration", "Network"];
  for (const category of categoryOrder) {
    const results = categories.get(category);
    if (!results || results.length === 0) continue;

    runtime.log(chalk.bold(`  ${category}`));

    for (const result of results) {
      runtime.log(formatResult(result, verbose));
      const hint = formatHint(result);
      if (hint && (result.status === "error" || result.status === "warning")) {
        runtime.log(hint);
      }
    }

    runtime.log("");
  }

  // Summary
  runtime.log(chalk.gray("  ─────────────────────────────────────────────"));
  runtime.log(`  ${formatSummary(report)}`);

  // Fix mode
  if (fix && (report.errors > 0 || report.warnings > 0)) {
    const fixedCount = await runFixes(report, runtime);

    if (fixedCount > 0) {
      runtime.log(
        chalk.gray("\n  ─────────────────────────────────────────────"),
      );
      runtime.log(
        chalk.cyan(
          `  Applied ${fixedCount} fix(es). Running checks again...\n`,
        ),
      );

      // Re-run checks to show updated status
      const newReport = await runAllPrerequisiteChecks();
      runtime.log(`  ${formatSummary(newReport)}`);
      runtime.log("");

      if (newReport.errors > 0) {
        runtime.log(
          chalk.yellow(
            "  Some issues remain. Run 'clawdis doctor --fix' again or fix manually.",
          ),
        );
        runtime.log("");
        runtime.exit(1);
      } else {
        runtime.log(chalk.green("  All systems go!"));
        runtime.log("");
      }
      return;
    }
  }

  runtime.log("");

  // Exit status
  if (report.errors > 0) {
    if (!fix) {
      runtime.log(
        chalk.yellow(
          "  Run 'clawdis doctor --fix' to attempt automatic fixes.",
        ),
      );
      runtime.log("");
    }
    runtime.log(
      chalk.red(
        "  Some required prerequisites are missing. Please fix them before continuing.",
      ),
    );
    runtime.log("");
    runtime.exit(1);
  } else if (report.warnings > 0) {
    if (!fix) {
      runtime.log(
        chalk.gray(
          "  Run 'clawdis doctor --fix' to configure optional features.",
        ),
      );
      runtime.log("");
    }
    runtime.log(
      chalk.yellow(
        "  Some optional prerequisites are missing. Clawdis will still work.",
      ),
    );
    runtime.log("");
  } else {
    runtime.log(chalk.green("  All systems go!"));
    runtime.log("");
  }
}

function getCategoryForResult(name: string): string {
  const mapping: Record<string, string> = {
    "Node.js": "Runtime",
    pnpm: "Tools",
    Git: "Tools",
    FFmpeg: "Tools",
    Tailscale: "Tools",
    "Write Permissions": "Runtime",
    "Config Directory": "Configuration",
    "Config File": "Configuration",
    "Agent Workspace": "Configuration",
  };
  return mapping[name] || "Other";
}
