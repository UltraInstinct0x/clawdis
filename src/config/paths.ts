/**
 * Centralized cross-platform path resolution for Clawdis configuration and data.
 *
 * Follows platform conventions:
 * - Linux: XDG Base Directory ($XDG_CONFIG_HOME, $XDG_DATA_HOME)
 * - macOS: ~/Library/Application Support or ~/.clawdis (legacy default)
 * - Windows: %APPDATA% or %LOCALAPPDATA%
 * - Docker: volume mount detection via CLAWDIS_DOCKER=1
 *
 * Environment variable overrides (highest priority):
 * - CLAWDIS_CONFIG_DIR: override config directory
 * - CLAWDIS_DATA_DIR: override data directory
 * - CLAWDIS_WORKSPACE_DIR: override workspace directory
 */

import os from "node:os";
import path from "node:path";

const APP_NAME = "clawdis";

/**
 * Detect if running in a Docker container.
 * Checks for explicit env var or /.dockerenv file existence.
 */
export function isDocker(): boolean {
  if (process.env.CLAWDIS_DOCKER === "1") return true;
  // /.dockerenv is created by Docker runtime
  try {
    const fs = require("node:fs");
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

/**
 * Get the configuration directory.
 *
 * Priority:
 * 1. CLAWDIS_CONFIG_DIR env var
 * 2. Docker: /config
 * 3. Linux: $XDG_CONFIG_HOME/clawdis or ~/.config/clawdis
 * 4. macOS: ~/.clawdis (legacy, widely deployed)
 * 5. Windows: %APPDATA%/clawdis
 * 6. Fallback: ~/.clawdis
 */
export function getConfigDir(): string {
  // Env override takes precedence
  const envOverride = process.env.CLAWDIS_CONFIG_DIR;
  if (envOverride) {
    return envOverride.startsWith("~")
      ? path.join(os.homedir(), envOverride.slice(1))
      : envOverride;
  }

  // Docker container default
  if (isDocker()) {
    return "/config";
  }

  const platform = process.platform;
  const home = os.homedir();

  if (platform === "linux") {
    // XDG Base Directory compliance
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    if (xdgConfig) {
      return path.join(xdgConfig, APP_NAME);
    }
    return path.join(home, ".config", APP_NAME);
  }

  if (platform === "darwin") {
    // macOS: keep ~/.clawdis for backward compatibility (widely deployed)
    // Users can override to ~/Library/Application Support via env var
    return path.join(home, `.${APP_NAME}`);
  }

  if (platform === "win32") {
    // Windows: use %APPDATA% (roaming) for config
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, APP_NAME);
    }
    // Fallback if APPDATA is not set
    return path.join(home, "AppData", "Roaming", APP_NAME);
  }

  // Fallback for unknown platforms
  return path.join(home, `.${APP_NAME}`);
}

/**
 * Get the data directory (for credentials, sessions, caches).
 *
 * Priority:
 * 1. CLAWDIS_DATA_DIR env var
 * 2. Docker: /data
 * 3. Linux: $XDG_DATA_HOME/clawdis or ~/.local/share/clawdis
 * 4. macOS: ~/.clawdis (same as config for legacy compatibility)
 * 5. Windows: %LOCALAPPDATA%/clawdis
 * 6. Fallback: ~/.clawdis
 */
export function getDataDir(): string {
  // Env override takes precedence
  const envOverride = process.env.CLAWDIS_DATA_DIR;
  if (envOverride) {
    return envOverride.startsWith("~")
      ? path.join(os.homedir(), envOverride.slice(1))
      : envOverride;
  }

  // Docker container default
  if (isDocker()) {
    return "/data";
  }

  const platform = process.platform;
  const home = os.homedir();

  if (platform === "linux") {
    // XDG Base Directory compliance
    const xdgData = process.env.XDG_DATA_HOME;
    if (xdgData) {
      return path.join(xdgData, APP_NAME);
    }
    return path.join(home, ".local", "share", APP_NAME);
  }

  if (platform === "darwin") {
    // macOS: keep ~/.clawdis for backward compatibility
    return path.join(home, `.${APP_NAME}`);
  }

  if (platform === "win32") {
    // Windows: use %LOCALAPPDATA% for data (local, not roaming)
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      return path.join(localAppData, APP_NAME);
    }
    // Fallback if LOCALAPPDATA is not set
    return path.join(home, "AppData", "Local", APP_NAME);
  }

  // Fallback for unknown platforms
  return path.join(home, `.${APP_NAME}`);
}

/**
 * Get the credentials directory (WhatsApp auth state, OAuth tokens, etc.).
 * Lives under the data directory.
 */
export function getCredentialsDir(): string {
  return path.join(getDataDir(), "credentials");
}

/**
 * Get the sessions directory (conversation transcripts, session state).
 * Lives under the data directory.
 */
export function getSessionsDir(): string {
  return path.join(getDataDir(), "sessions");
}

/**
 * Get the workspace directory (agent working directory).
 *
 * Priority:
 * 1. CLAWDIS_WORKSPACE_DIR env var
 * 2. Docker: /workspace
 * 3. All platforms: ~/clawd
 */
export function getWorkspaceDir(): string {
  // Env override takes precedence
  const envOverride = process.env.CLAWDIS_WORKSPACE_DIR;
  if (envOverride) {
    return envOverride.startsWith("~")
      ? path.join(os.homedir(), envOverride.slice(1))
      : envOverride;
  }

  // Docker container default
  if (isDocker()) {
    return "/workspace";
  }

  // Standard workspace location
  return path.join(os.homedir(), "clawd");
}

/**
 * Get the main configuration file path (clawdis.json).
 */
export function getConfigFilePath(): string {
  return path.join(getConfigDir(), "clawdis.json");
}

/**
 * Get the session store file path (sessions.json).
 */
export function getSessionStorePath(): string {
  return path.join(getSessionsDir(), "sessions.json");
}

/**
 * Get the canvas host root directory.
 */
export function getCanvasDir(): string {
  return path.join(getWorkspaceDir(), "canvas");
}

/**
 * Get the skills directory.
 */
export function getSkillsDir(): string {
  return path.join(getWorkspaceDir(), "skills");
}

/**
 * Resolve a user-provided path, expanding ~ to home directory.
 */
export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return path.resolve(trimmed.replace("~", os.homedir()));
  }
  return path.resolve(trimmed);
}

/**
 * Get macOS Application Support directory (for apps that prefer it).
 * Returns null on non-macOS platforms.
 */
export function getMacAppSupportDir(): string | null {
  if (process.platform !== "darwin") return null;
  return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
}

/**
 * Check if we're using legacy paths (pre-XDG).
 * Useful for migration detection.
 */
export function isLegacyPathLayout(): boolean {
  // If explicit env vars are set, not legacy
  if (process.env.CLAWDIS_CONFIG_DIR || process.env.CLAWDIS_DATA_DIR) {
    return false;
  }

  // macOS always uses legacy ~/.clawdis by default
  if (process.platform === "darwin") {
    return true;
  }

  // Linux with XDG vars set is not legacy
  if (process.platform === "linux") {
    if (process.env.XDG_CONFIG_HOME || process.env.XDG_DATA_HOME) {
      return false;
    }
    // Linux without XDG vars still uses XDG-compliant paths by default
    return false;
  }

  return false;
}
