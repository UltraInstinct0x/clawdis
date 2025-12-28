/**
 * Interactive setup wizard for Clawdis.
 * Guides users through initial configuration with step-by-step prompts.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import chalk from "chalk";

import {
  DEFAULT_AGENT_WORKSPACE_DIR,
  ensureAgentWorkspace,
} from "../agents/workspace.js";
import {
  cancelWizard,
  printBullet,
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
  promptConfirm,
  promptInput,
  promptMultiSelect,
  promptSelect,
  runWizard,
  type SelectOption,
  type WizardStep,
} from "../cli/wizard.js";
import {
  type ClawdisConfig,
  CONFIG_PATH_CLAWDIS,
  writeConfigFile,
} from "../config/config.js";
import { resolveSessionTranscriptsDir } from "../config/sessions.js";
import {
  formatCheckResult,
  type PrerequisiteCheckSummary,
  runAllPrerequisiteChecks,
} from "../infra/prerequisites.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";

/** Deployment pattern options */
export type DeploymentPattern = "local" | "cloud-gateway" | "headless";

/** Provider types */
export type ProviderType = "whatsapp" | "telegram" | "discord";

/** Wizard configuration collected from all steps */
export type WizardConfig = {
  prerequisites: PrerequisiteCheckSummary;
  deployment: DeploymentPattern;
  providers: ProviderType[];
  workspace: {
    path: string;
    name?: string;
  };
  confirmed: boolean;
};

/**
 * Step 1: Prerequisites check
 */
async function runPrerequisitesStep(): Promise<PrerequisiteCheckSummary> {
  console.log();
  console.log(chalk.gray("Checking system prerequisites..."));
  console.log();

  const summary = await runAllPrerequisiteChecks();

  // Display results
  for (const check of summary.checks) {
    const line = formatCheckResult(check);
    switch (check.status) {
      case "ok":
        console.log(chalk.green(line));
        break;
      case "warning":
        console.log(chalk.yellow(line));
        break;
      case "error":
        console.log(chalk.red(line));
        break;
      case "skipped":
        console.log(chalk.gray(line));
        break;
    }
  }

  console.log();

  // Summary line
  const parts: string[] = [];
  if (summary.passed > 0) parts.push(chalk.green(`${summary.passed} passed`));
  if (summary.warnings > 0)
    parts.push(chalk.yellow(`${summary.warnings} warnings`));
  if (summary.errors > 0) parts.push(chalk.red(`${summary.errors} errors`));
  if (summary.skipped > 0) parts.push(chalk.gray(`${summary.skipped} skipped`));

  console.log(`Summary: ${parts.join(", ")}`);

  if (!summary.allRequiredPassed) {
    console.log();
    console.log(
      chalk.red(
        "Some required prerequisites failed. Please fix them before continuing.",
      ),
    );
    const proceed = await promptConfirm(
      "Continue anyway (not recommended)?",
      false,
    );
    if (!proceed) {
      cancelWizard();
    }
  }

  return summary;
}

/**
 * Step 2: Deployment pattern selection
 */
async function runDeploymentStep(): Promise<DeploymentPattern> {
  const options: SelectOption<DeploymentPattern>[] = [
    {
      label: "Local (Single Machine)",
      value: "local",
      description:
        "Run everything on this machine. Best for personal use or development.",
    },
    {
      label: "Cloud Gateway",
      value: "cloud-gateway",
      description:
        "Connect to a remote gateway server. Best for multi-device access.",
    },
    {
      label: "Headless Server",
      value: "headless",
      description:
        "Run without GUI. Best for servers, Raspberry Pi, or Docker.",
    },
  ];

  return promptSelect("How do you plan to use Clawdis?", options);
}

/**
 * Step 3: Provider selection
 */
async function runProvidersStep(): Promise<ProviderType[]> {
  const options: SelectOption<ProviderType>[] = [
    {
      label: "WhatsApp",
      value: "whatsapp",
      description: "Connect via WhatsApp Web (requires QR code scan)",
    },
    {
      label: "Telegram",
      value: "telegram",
      description: "Connect via Telegram Bot API (requires bot token)",
    },
    {
      label: "Discord",
      value: "discord",
      description: "Connect via Discord Bot (requires bot token)",
    },
  ];

  const selected = await promptMultiSelect(
    "Which messaging providers do you want to configure?",
    options,
    [0], // Default to WhatsApp
  );

  if (selected.length === 0) {
    console.log(chalk.yellow("At least one provider is recommended."));
    const none = await promptConfirm("Continue without any providers?", false);
    if (!none) {
      // Re-run the step
      return runProvidersStep();
    }
  }

  return selected;
}

/**
 * Step 4: Workspace configuration
 */
async function runWorkspaceStep(): Promise<{ path: string; name?: string }> {
  // Workspace path
  const defaultPath = DEFAULT_AGENT_WORKSPACE_DIR;
  const workspacePath = await promptInput(
    "Agent workspace directory",
    defaultPath,
  );

  // Resolve ~ if present
  const resolvedPath = workspacePath.startsWith("~")
    ? path.join(os.homedir(), workspacePath.slice(1))
    : workspacePath;

  // Optional: Agent name
  console.log();
  console.log(
    chalk.gray(
      "You can give your agent a name (shown in IDENTITY.md and config).",
    ),
  );
  const name = await promptInput("Agent name (optional)", "");

  return {
    path: resolvedPath,
    name: name || undefined,
  };
}

/**
 * Step 5: Summary and confirmation
 */
async function runConfirmationStep(
  config: Partial<WizardConfig>,
): Promise<boolean> {
  printHeader("Configuration Summary");

  // Prerequisites
  const prereqs = config.prerequisites;
  if (prereqs) {
    console.log();
    console.log(chalk.bold("Prerequisites:"));
    if (prereqs.allRequiredPassed) {
      printSuccess("All required checks passed");
    } else {
      printWarning("Some required checks failed");
    }
  }

  // Deployment
  console.log();
  console.log(chalk.bold("Deployment Pattern:"));
  const deploymentLabels: Record<DeploymentPattern, string> = {
    local: "Local (Single Machine)",
    "cloud-gateway": "Cloud Gateway",
    headless: "Headless Server",
  };
  printBullet(deploymentLabels[config.deployment ?? "local"]);

  // Providers
  console.log();
  console.log(chalk.bold("Messaging Providers:"));
  const providers = config.providers ?? [];
  if (providers.length === 0) {
    printWarning("None selected");
  } else {
    for (const p of providers) {
      printBullet(p.charAt(0).toUpperCase() + p.slice(1));
    }
  }

  // Workspace
  console.log();
  console.log(chalk.bold("Workspace:"));
  printBullet(`Path: ${config.workspace?.path ?? DEFAULT_AGENT_WORKSPACE_DIR}`);
  if (config.workspace?.name) {
    printBullet(`Agent name: ${config.workspace.name}`);
  }

  // Files to be created/modified
  console.log();
  console.log(chalk.bold("Files to create/modify:"));
  printBullet(CONFIG_PATH_CLAWDIS);
  printBullet(
    `${config.workspace?.path ?? DEFAULT_AGENT_WORKSPACE_DIR}/AGENTS.md`,
  );
  printBullet(
    `${config.workspace?.path ?? DEFAULT_AGENT_WORKSPACE_DIR}/IDENTITY.md`,
  );
  printBullet(
    `${config.workspace?.path ?? DEFAULT_AGENT_WORKSPACE_DIR}/BOOTSTRAP.md`,
  );

  console.log();
  return promptConfirm("Apply this configuration?", true);
}

/**
 * Apply the wizard configuration.
 */
async function applyWizardConfig(
  config: WizardConfig,
  _runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  printHeader("Applying Configuration", "Setting up Clawdis...");

  // 1. Create/update config file
  const clawdisConfig: ClawdisConfig = {};

  // Set workspace
  clawdisConfig.agent = {
    workspace: config.workspace.path,
  };

  // Set identity if name provided
  if (config.workspace.name) {
    clawdisConfig.identity = {
      name: config.workspace.name,
    };
  }

  // Configure providers based on selection
  if (!config.providers.includes("whatsapp")) {
    clawdisConfig.web = { enabled: false };
  }
  if (!config.providers.includes("telegram")) {
    clawdisConfig.telegram = { enabled: false };
  }
  if (!config.providers.includes("discord")) {
    clawdisConfig.discord = { enabled: false };
  }

  // Gateway mode based on deployment
  if (config.deployment === "cloud-gateway") {
    clawdisConfig.gateway = { mode: "remote" };
  } else if (config.deployment === "headless") {
    clawdisConfig.gateway = { mode: "local", bind: "lan" };
  }

  // Write config
  await writeConfigFile(clawdisConfig);
  printSuccess(`Wrote ${CONFIG_PATH_CLAWDIS}`);

  // 2. Create workspace directory and bootstrap files
  const ws = await ensureAgentWorkspace({
    dir: config.workspace.path,
    ensureBootstrapFiles: true,
  });
  printSuccess(`Workspace ready: ${ws.dir}`);

  // 3. Create sessions directory
  const sessionsDir = resolveSessionTranscriptsDir();
  await fs.mkdir(sessionsDir, { recursive: true });
  printSuccess(`Sessions directory: ${sessionsDir}`);

  // 4. Print next steps
  console.log();
  printHeader("Setup Complete");

  console.log();
  console.log(chalk.bold("Next Steps:"));
  console.log();

  const steps: string[] = [];

  if (config.providers.includes("whatsapp")) {
    steps.push("Link WhatsApp: clawdis login --verbose");
  }
  if (config.providers.includes("telegram")) {
    steps.push(
      "Configure Telegram: Add telegram.botToken to ~/.clawdis/clawdis.json",
    );
  }
  if (config.providers.includes("discord")) {
    steps.push(
      "Configure Discord: Add discord.token to ~/.clawdis/clawdis.json",
    );
  }
  steps.push("Start gateway: clawdis gateway");
  steps.push("Check status: clawdis status");

  for (let i = 0; i < steps.length; i++) {
    console.log(chalk.cyan(`  ${i + 1}. ${steps[i]}`));
  }

  console.log();
  printInfo("Run 'clawdis --help' for more commands");
}

/**
 * Run the interactive setup wizard.
 */
export async function runSetupWizard(
  opts?: {
    /** Skip confirmation step */
    skipConfirm?: boolean;
    /** Pre-set workspace path */
    workspace?: string;
  },
  runtime: RuntimeEnv = defaultRuntime,
): Promise<WizardConfig | null> {
  printHeader("Clawdis Setup Wizard", "Interactive configuration for Clawdis");

  // Collected configuration
  let prerequisites: PrerequisiteCheckSummary | undefined;
  let deployment: DeploymentPattern | undefined;
  let providers: ProviderType[] | undefined;
  let workspace: { path: string; name?: string } | undefined;

  // Define wizard steps
  const steps: WizardStep<unknown>[] = [
    {
      id: "prerequisites",
      title: "Prerequisites Check",
      description: "Verifying system requirements",
      run: async () => {
        prerequisites = await runPrerequisitesStep();
        return prerequisites;
      },
    },
    {
      id: "deployment",
      title: "Deployment Pattern",
      description: "Choose how you want to run Clawdis",
      run: async () => {
        deployment = await runDeploymentStep();
        return deployment;
      },
    },
    {
      id: "providers",
      title: "Messaging Providers",
      description: "Select which messaging platforms to configure",
      run: async () => {
        providers = await runProvidersStep();
        return providers;
      },
    },
    {
      id: "workspace",
      title: "Workspace Configuration",
      description: "Configure the agent workspace",
      run: async () => {
        // Use pre-set workspace if provided
        if (opts?.workspace) {
          workspace = { path: opts.workspace };
          printInfo(`Using workspace: ${opts.workspace}`);
          return workspace;
        }
        workspace = await runWorkspaceStep();
        return workspace;
      },
    },
    {
      id: "confirm",
      title: "Confirm & Apply",
      description: "Review and apply configuration",
      skip: () => opts?.skipConfirm ?? false,
      run: async () => {
        const config: Partial<WizardConfig> = {
          prerequisites,
          deployment,
          providers,
          workspace,
        };
        const confirmed = await runConfirmationStep(config);
        if (!confirmed) {
          console.log();
          printWarning("Setup cancelled. No changes were made.");
          cancelWizard();
        }
        return confirmed;
      },
    },
  ];

  // Run the wizard
  const result = await runWizard(steps);

  if (result.cancelled || !result.completed) {
    return null;
  }

  // Build final config
  const finalConfig: WizardConfig = {
    prerequisites: prerequisites ?? (await runAllPrerequisiteChecks()),
    deployment: deployment ?? "local",
    providers: providers ?? [],
    workspace: workspace ?? { path: DEFAULT_AGENT_WORKSPACE_DIR },
    confirmed: true,
  };

  // Apply configuration
  await applyWizardConfig(finalConfig, runtime);

  return finalConfig;
}

/**
 * Entry point for the setup wizard command.
 */
export async function setupWizardCommand(
  opts?: { workspace?: string },
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  try {
    const result = await runSetupWizard(opts, runtime);
    if (!result) {
      runtime.exit(1);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "WIZARD_CANCELLED") {
      // User cancelled - already handled
      runtime.exit(0);
    }
    throw err;
  }
}
