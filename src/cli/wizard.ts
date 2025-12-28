/**
 * Interactive wizard utilities for CLI prompts.
 * Provides single-select, multi-select, and text input prompts.
 */

import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";

import chalk from "chalk";

import { isYes } from "../globals.js";

/** Option for select/multiselect prompts */
export type SelectOption<T = string> = {
  /** Display label shown to user */
  label: string;
  /** Value returned when selected */
  value: T;
  /** Optional description shown below label */
  description?: string;
  /** Whether this option is disabled */
  disabled?: boolean;
  /** Reason shown when disabled */
  disabledReason?: string;
};

/** Configuration for a wizard step */
export type WizardStep<T = unknown> = {
  /** Unique step identifier */
  id: string;
  /** Step title displayed to user */
  title: string;
  /** Optional description */
  description?: string;
  /** Execute the step and return result */
  run: () => Promise<T>;
  /** Whether to skip this step (evaluated at runtime) */
  skip?: () => boolean | Promise<boolean>;
  /** Called when step completes successfully */
  onComplete?: (result: T) => void | Promise<void>;
};

/** Result from running a wizard */
export type WizardResult<T extends Record<string, unknown>> = {
  /** Whether the wizard completed successfully */
  completed: boolean;
  /** Whether the user cancelled */
  cancelled: boolean;
  /** Collected results from all steps */
  results: Partial<T>;
  /** ID of step where wizard stopped (if not completed) */
  stoppedAt?: string;
};

/**
 * Display a single-choice selection prompt.
 * Returns the selected option's value.
 */
export async function promptSelect<T = string>(
  question: string,
  options: SelectOption<T>[],
  defaultIndex = 0,
): Promise<T> {
  // If --yes flag is set, return the default option
  if (isYes()) {
    const enabledOptions = options.filter((o) => !o.disabled);
    const defaultOpt =
      enabledOptions[Math.min(defaultIndex, enabledOptions.length - 1)];
    return defaultOpt?.value ?? options[0].value;
  }

  const rl = readline.createInterface({ input, output });

  // Display the question
  console.log();
  console.log(chalk.bold.cyan(question));
  console.log();

  // Display options with numbers
  const enabledOptions: Array<{ idx: number; opt: SelectOption<T> }> = [];
  options.forEach((opt, idx) => {
    const num = idx + 1;
    if (opt.disabled) {
      console.log(
        chalk.gray(
          `  ${num}. ${opt.label}${opt.disabledReason ? ` (${opt.disabledReason})` : " (unavailable)"}`,
        ),
      );
    } else {
      const isDefault = enabledOptions.length === defaultIndex;
      const marker = isDefault ? chalk.cyan(" (default)") : "";
      console.log(`  ${chalk.yellow(num.toString())}. ${opt.label}${marker}`);
      if (opt.description) {
        console.log(chalk.gray(`     ${opt.description}`));
      }
      enabledOptions.push({ idx, opt });
    }
  });

  console.log();

  // Read user input
  const defaultNum =
    enabledOptions.length > 0
      ? enabledOptions[Math.min(defaultIndex, enabledOptions.length - 1)].idx +
        1
      : 1;
  const answer = await rl.question(
    chalk.gray(`Enter choice [${defaultNum}]: `),
  );
  rl.close();

  const trimmed = answer.trim();
  if (!trimmed) {
    // Return default
    return enabledOptions[Math.min(defaultIndex, enabledOptions.length - 1)].opt
      .value;
  }

  const num = Number.parseInt(trimmed, 10);
  if (Number.isNaN(num) || num < 1 || num > options.length) {
    console.log(chalk.yellow("Invalid choice, using default."));
    return enabledOptions[Math.min(defaultIndex, enabledOptions.length - 1)].opt
      .value;
  }

  const selected = options[num - 1];
  if (selected.disabled) {
    console.log(chalk.yellow("That option is unavailable, using default."));
    return enabledOptions[Math.min(defaultIndex, enabledOptions.length - 1)].opt
      .value;
  }

  return selected.value;
}

/**
 * Display a multiple-choice selection prompt.
 * Returns an array of selected option values.
 */
export async function promptMultiSelect<T = string>(
  question: string,
  options: SelectOption<T>[],
  defaultIndices: number[] = [],
): Promise<T[]> {
  // If --yes flag is set, return the default options
  if (isYes()) {
    const enabledOptions = options.filter((o) => !o.disabled);
    if (defaultIndices.length === 0) {
      return enabledOptions.map((o) => o.value);
    }
    return defaultIndices
      .filter((i) => i >= 0 && i < enabledOptions.length)
      .map((i) => enabledOptions[i].value);
  }

  const rl = readline.createInterface({ input, output });

  // Display the question
  console.log();
  console.log(chalk.bold.cyan(question));
  console.log(chalk.gray("(Enter comma-separated numbers, e.g., 1,2,3)"));
  console.log();

  // Display options with numbers
  const enabledOptions: Array<{ idx: number; opt: SelectOption<T> }> = [];
  options.forEach((opt, idx) => {
    const num = idx + 1;
    if (opt.disabled) {
      console.log(
        chalk.gray(
          `  ${num}. ${opt.label}${opt.disabledReason ? ` (${opt.disabledReason})` : " (unavailable)"}`,
        ),
      );
    } else {
      const enabledIdx = enabledOptions.length;
      const isDefault = defaultIndices.includes(enabledIdx);
      const marker = isDefault ? chalk.cyan(" *") : "";
      console.log(`  ${chalk.yellow(num.toString())}. ${opt.label}${marker}`);
      if (opt.description) {
        console.log(chalk.gray(`     ${opt.description}`));
      }
      enabledOptions.push({ idx, opt });
    }
  });

  console.log();

  // Build default display
  const defaultDisplay =
    defaultIndices.length > 0
      ? defaultIndices
          .filter((i) => i >= 0 && i < enabledOptions.length)
          .map((i) => enabledOptions[i].idx + 1)
          .join(",")
      : "none";

  const answer = await rl.question(
    chalk.gray(`Enter choices [${defaultDisplay}]: `),
  );
  rl.close();

  const trimmed = answer.trim();
  if (!trimmed) {
    // Return defaults
    if (defaultIndices.length === 0) {
      return [];
    }
    return defaultIndices
      .filter((i) => i >= 0 && i < enabledOptions.length)
      .map((i) => enabledOptions[i].opt.value);
  }

  // Parse comma-separated numbers
  const parts = trimmed.split(",").map((s) => s.trim());
  const results: T[] = [];
  const seen = new Set<number>();

  for (const part of parts) {
    if (!part) continue;
    const num = Number.parseInt(part, 10);
    if (Number.isNaN(num) || num < 1 || num > options.length) {
      console.log(chalk.yellow(`Ignoring invalid choice: ${part}`));
      continue;
    }
    if (seen.has(num)) continue;
    seen.add(num);

    const selected = options[num - 1];
    if (selected.disabled) {
      console.log(chalk.yellow(`Ignoring unavailable option: ${num}`));
      continue;
    }
    results.push(selected.value);
  }

  return results;
}

/**
 * Display a text input prompt.
 * Returns the entered text or the default value.
 */
export async function promptInput(
  question: string,
  defaultValue?: string,
): Promise<string> {
  // If --yes flag is set, return the default value
  if (isYes()) {
    return defaultValue ?? "";
  }

  const rl = readline.createInterface({ input, output });

  console.log();
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`${chalk.bold.cyan(question)}${suffix}: `);
  rl.close();

  const trimmed = answer.trim();
  return trimmed || defaultValue || "";
}

/**
 * Display a confirmation prompt (yes/no).
 * More flexible than promptYesNo from prompt.ts.
 */
export async function promptConfirm(
  question: string,
  defaultYes = false,
): Promise<boolean> {
  // If --yes flag is set, return true
  if (isYes()) {
    return true;
  }

  const rl = readline.createInterface({ input, output });

  const suffix = defaultYes ? " [Y/n]" : " [y/N]";
  const answer = await rl.question(`${chalk.bold.cyan(question)}${suffix}: `);
  rl.close();

  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) {
    return defaultYes;
  }
  return trimmed.startsWith("y");
}

/**
 * Run a series of wizard steps and collect results.
 */
export async function runWizard<T extends Record<string, unknown>>(
  steps: WizardStep<T[keyof T]>[],
  options?: {
    /** Show step numbers (e.g., "Step 1/5") */
    showProgress?: boolean;
    /** Called before each step */
    onStepStart?: (step: WizardStep<T[keyof T]>, index: number) => void;
  },
): Promise<WizardResult<T>> {
  const results: Partial<T> = {};
  const total = steps.length;
  const showProgress = options?.showProgress ?? true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Check if step should be skipped
    if (step.skip) {
      const shouldSkip = await step.skip();
      if (shouldSkip) {
        continue;
      }
    }

    // Show step header
    if (showProgress) {
      console.log();
      console.log(
        chalk.bold.blue(`--- Step ${i + 1}/${total}: ${step.title} ---`),
      );
    } else {
      console.log();
      console.log(chalk.bold.blue(`--- ${step.title} ---`));
    }

    if (step.description) {
      console.log(chalk.gray(step.description));
    }

    options?.onStepStart?.(step, i);

    try {
      const result = await step.run();
      (results as Record<string, unknown>)[step.id] = result;

      if (step.onComplete) {
        await step.onComplete(result);
      }
    } catch (err) {
      // Check if user cancelled
      if (err instanceof Error && err.message === "WIZARD_CANCELLED") {
        return {
          completed: false,
          cancelled: true,
          results,
          stoppedAt: step.id,
        };
      }
      throw err;
    }
  }

  return {
    completed: true,
    cancelled: false,
    results,
  };
}

/**
 * Cancel the wizard (throw from within a step's run function).
 */
export function cancelWizard(): never {
  throw new Error("WIZARD_CANCELLED");
}

/**
 * Print a section header.
 */
export function printHeader(title: string, subtitle?: string): void {
  console.log();
  console.log(chalk.bold.cyan("=".repeat(50)));
  console.log(chalk.bold.cyan(`  ${title}`));
  if (subtitle) {
    console.log(chalk.gray(`  ${subtitle}`));
  }
  console.log(chalk.bold.cyan("=".repeat(50)));
}

/**
 * Print a success message.
 */
export function printSuccess(message: string): void {
  console.log(chalk.green(`  [OK] ${message}`));
}

/**
 * Print a warning message.
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow(`  [!] ${message}`));
}

/**
 * Print an error message.
 */
export function printError(message: string): void {
  console.log(chalk.red(`  [X] ${message}`));
}

/**
 * Print an info message.
 */
export function printInfo(message: string): void {
  console.log(chalk.gray(`  [i] ${message}`));
}

/**
 * Print a bullet point list item.
 */
export function printBullet(message: string, indent = 0): void {
  const spaces = "  ".repeat(indent);
  console.log(`${spaces}  - ${message}`);
}
