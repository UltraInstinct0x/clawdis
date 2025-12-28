/**
 * Prerequisite checking utilities for Clawdis setup.
 * Validates that required dependencies and configurations are in place.
 */

import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Build a comprehensive PATH for subprocess execution.
 * This ensures we can find binaries even when running from a minimal environment
 * (e.g., when launched via a wrapper script without shell initialization).
 */
function getEnhancedPath(): string {
  const currentPath = process.env.PATH || "";
  const extraPaths = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    "/snap/bin", // Ubuntu snap packages (tailscale)
    "/opt/homebrew/bin", // macOS Homebrew ARM
    "/usr/local/opt/bin", // macOS Homebrew Intel
    `${os.homedir()}/.local/bin`,
    `${os.homedir()}/bin`,
  ];

  // Combine current PATH with extra paths, avoiding duplicates
  const allPaths = new Set(currentPath.split(":").concat(extraPaths));
  return Array.from(allPaths).filter(Boolean).join(":");
}

/** Status of a prerequisite check */
export type PrerequisiteStatus = "ok" | "warning" | "error" | "skipped";

/** Result of a single prerequisite check */
export type PrerequisiteCheckResult = {
  /** Unique identifier for this prerequisite */
  id: string;
  /** Human-readable name */
  name: string;
  /** Status of the check */
  status: PrerequisiteStatus;
  /** Detailed message */
  message: string;
  /** Version string if applicable */
  version?: string;
  /** Path to the checked resource if applicable */
  path?: string;
  /** Suggested fix if status is warning or error */
  fix?: string;
  /** Whether this prerequisite is required (vs optional) */
  required: boolean;
};

/** Aggregate result of all prerequisite checks */
export type PrerequisiteCheckSummary = {
  /** All individual check results */
  checks: PrerequisiteCheckResult[];
  /** Number of checks that passed */
  passed: number;
  /** Number of checks with warnings */
  warnings: number;
  /** Number of checks that failed */
  errors: number;
  /** Number of checks skipped */
  skipped: number;
  /** Whether all required checks passed */
  allRequiredPassed: boolean;
};

/**
 * Check if a command exists and get its version.
 */
async function checkCommand(
  command: string,
  versionFlag = "--version",
): Promise<{ exists: boolean; version?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(`${command} ${versionFlag}`, {
      timeout: 10000,
      env: { ...process.env, PATH: getEnhancedPath() },
    });
    const output = stdout || stderr;
    // Extract version from output (usually first line)
    const versionMatch = output.match(/(\d+\.\d+(?:\.\d+)?)/);
    return {
      exists: true,
      version: versionMatch ? versionMatch[1] : output.trim().split("\n")[0],
    };
  } catch (err) {
    return {
      exists: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if Node.js is installed and meets minimum version.
 * Uses process.version to check the actual running Node.js, not a subprocess.
 */
export async function checkNode(
  minVersion = "18.0.0",
): Promise<PrerequisiteCheckResult> {
  // Use process.version directly instead of spawning a subprocess.
  // This ensures we check the node that's actually running clawdis,
  // not whatever 'node' is found in PATH (which may be system node).
  const version = process.version.replace(/^v/, "");

  const currentParts = version.split(".").map(Number);
  const minParts = minVersion.split(".").map(Number);

  let meetsMin = true;
  for (let i = 0; i < minParts.length; i++) {
    const current = currentParts[i] ?? 0;
    const min = minParts[i] ?? 0;
    if (current < min) {
      meetsMin = false;
      break;
    }
    if (current > min) break;
  }

  if (!meetsMin) {
    return {
      id: "node",
      name: "Node.js",
      status: "warning",
      message: `Node.js ${version} is below recommended ${minVersion}`,
      version,
      required: true,
      fix: `Upgrade Node.js to ${minVersion}+`,
    };
  }

  return {
    id: "node",
    name: "Node.js",
    status: "ok",
    message: `Node.js ${version} installed`,
    version,
    required: true,
  };
}

/**
 * Check if pnpm is installed.
 */
export async function checkPnpm(): Promise<PrerequisiteCheckResult> {
  const result = await checkCommand("pnpm");

  if (!result.exists) {
    return {
      id: "pnpm",
      name: "pnpm",
      status: "warning",
      message: "pnpm is not installed (npm/yarn work but pnpm is recommended)",
      required: false,
      fix: "Install pnpm: npm install -g pnpm",
    };
  }

  return {
    id: "pnpm",
    name: "pnpm",
    status: "ok",
    message: `pnpm ${result.version} installed`,
    version: result.version,
    required: false,
  };
}

/**
 * Check if Git is installed.
 */
export async function checkGit(): Promise<PrerequisiteCheckResult> {
  const result = await checkCommand("git");

  if (!result.exists) {
    return {
      id: "git",
      name: "Git",
      status: "warning",
      message: "Git is not installed (optional but recommended)",
      required: false,
      fix: "Install Git from https://git-scm.com",
    };
  }

  return {
    id: "git",
    name: "Git",
    status: "ok",
    message: `Git ${result.version} installed`,
    version: result.version,
    required: false,
  };
}

/**
 * Check if the Clawdis config directory exists.
 */
export async function checkConfigDir(): Promise<PrerequisiteCheckResult> {
  const configDir = path.join(os.homedir(), ".clawdis");

  if (!fs.existsSync(configDir)) {
    return {
      id: "config-dir",
      name: "Config Directory",
      status: "warning",
      message: "~/.clawdis does not exist (will be created during setup)",
      path: configDir,
      required: false,
    };
  }

  return {
    id: "config-dir",
    name: "Config Directory",
    status: "ok",
    message: "~/.clawdis exists",
    path: configDir,
    required: false,
  };
}

/**
 * Check if a config file exists.
 */
export async function checkConfigFile(): Promise<PrerequisiteCheckResult> {
  const configPath = path.join(os.homedir(), ".clawdis", "clawdis.json");

  if (!fs.existsSync(configPath)) {
    return {
      id: "config-file",
      name: "Config File",
      status: "warning",
      message: "clawdis.json does not exist (will be created during setup)",
      path: configPath,
      required: false,
    };
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    JSON.parse(content);
    return {
      id: "config-file",
      name: "Config File",
      status: "ok",
      message: "clawdis.json exists and is valid JSON",
      path: configPath,
      required: false,
    };
  } catch {
    return {
      id: "config-file",
      name: "Config File",
      status: "error",
      message: "clawdis.json exists but contains invalid JSON",
      path: configPath,
      required: false,
      fix: "Fix or delete ~/.clawdis/clawdis.json",
    };
  }
}

/**
 * Check if the agent workspace exists.
 */
export async function checkWorkspace(
  workspacePath?: string,
): Promise<PrerequisiteCheckResult> {
  const workspace = workspacePath ?? path.join(os.homedir(), "clawd");

  if (!fs.existsSync(workspace)) {
    return {
      id: "workspace",
      name: "Agent Workspace",
      status: "warning",
      message: `${workspace} does not exist (will be created during setup)`,
      path: workspace,
      required: false,
    };
  }

  const agentsPath = path.join(workspace, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    return {
      id: "workspace",
      name: "Agent Workspace",
      status: "warning",
      message: `${workspace} exists but AGENTS.md is missing`,
      path: workspace,
      required: false,
      fix: "Run setup to create bootstrap files",
    };
  }

  return {
    id: "workspace",
    name: "Agent Workspace",
    status: "ok",
    message: `${workspace} is configured`,
    path: workspace,
    required: false,
  };
}

/**
 * Check if ffmpeg is installed (required for media processing).
 */
export async function checkFfmpeg(): Promise<PrerequisiteCheckResult> {
  const result = await checkCommand("ffmpeg");

  if (!result.exists) {
    return {
      id: "ffmpeg",
      name: "FFmpeg",
      status: "warning",
      message: "ffmpeg is not installed (required for audio/video processing)",
      required: false,
      fix: "Install ffmpeg: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)",
    };
  }

  return {
    id: "ffmpeg",
    name: "FFmpeg",
    status: "ok",
    message: `ffmpeg ${result.version} installed`,
    version: result.version,
    required: false,
  };
}

/**
 * Check if Tailscale is installed (optional for remote access).
 */
export async function checkTailscale(): Promise<PrerequisiteCheckResult> {
  const result = await checkCommand("tailscale");

  if (!result.exists) {
    return {
      id: "tailscale",
      name: "Tailscale",
      status: "skipped",
      message: "Tailscale is not installed (optional for remote access)",
      required: false,
    };
  }

  return {
    id: "tailscale",
    name: "Tailscale",
    status: "ok",
    message: `Tailscale ${result.version} installed`,
    version: result.version,
    required: false,
  };
}

/**
 * Check write permissions for key directories.
 */
export async function checkPermissions(): Promise<PrerequisiteCheckResult> {
  const homeDir = os.homedir();
  const testDir = path.join(homeDir, ".clawdis");
  const testFile = path.join(testDir, ".permission-test");

  try {
    // Ensure directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Try to write a test file
    fs.writeFileSync(testFile, "test", "utf-8");
    fs.unlinkSync(testFile);

    return {
      id: "permissions",
      name: "Write Permissions",
      status: "ok",
      message: "Write access to ~/.clawdis confirmed",
      path: testDir,
      required: true,
    };
  } catch (err) {
    return {
      id: "permissions",
      name: "Write Permissions",
      status: "error",
      message: `Cannot write to ~/.clawdis: ${err instanceof Error ? err.message : String(err)}`,
      path: testDir,
      required: true,
      fix: "Check file permissions for your home directory",
    };
  }
}

/**
 * Run all prerequisite checks and return a summary.
 */
export async function runAllPrerequisiteChecks(options?: {
  /** Skip optional checks */
  requiredOnly?: boolean;
  /** Custom workspace path to check */
  workspacePath?: string;
}): Promise<PrerequisiteCheckSummary> {
  const checks: PrerequisiteCheckResult[] = [];

  // Always run required checks
  checks.push(await checkNode());
  checks.push(await checkPermissions());

  // Run optional checks unless skipped
  if (!options?.requiredOnly) {
    checks.push(await checkPnpm());
    checks.push(await checkGit());
    checks.push(await checkConfigDir());
    checks.push(await checkConfigFile());
    checks.push(await checkWorkspace(options?.workspacePath));
    checks.push(await checkFfmpeg());
    checks.push(await checkTailscale());
  }

  // Calculate summary
  let passed = 0;
  let warnings = 0;
  let errors = 0;
  let skipped = 0;
  let allRequiredPassed = true;

  for (const check of checks) {
    switch (check.status) {
      case "ok":
        passed++;
        break;
      case "warning":
        warnings++;
        break;
      case "error":
        errors++;
        if (check.required) {
          allRequiredPassed = false;
        }
        break;
      case "skipped":
        skipped++;
        break;
    }
  }

  return {
    checks,
    passed,
    warnings,
    errors,
    skipped,
    allRequiredPassed,
  };
}

/**
 * Format a check result for console output.
 */
export function formatCheckResult(check: PrerequisiteCheckResult): string {
  const statusIcon = {
    ok: "[OK]",
    warning: "[!]",
    error: "[X]",
    skipped: "[-]",
  }[check.status];

  let line = `  ${statusIcon} ${check.name}: ${check.message}`;
  if (check.fix && check.status !== "ok") {
    line += `\n      Fix: ${check.fix}`;
  }
  return line;
}
