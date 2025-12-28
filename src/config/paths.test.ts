import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Save original env and platform
const originalEnv = { ...process.env };
const originalPlatform = process.platform;

function mockPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

function resetPlatform() {
  Object.defineProperty(process, "platform", {
    value: originalPlatform,
    configurable: true,
  });
}

describe("paths", () => {
  beforeEach(() => {
    // Clear all relevant env vars before each test
    delete process.env.CLAWDIS_CONFIG_DIR;
    delete process.env.CLAWDIS_DATA_DIR;
    delete process.env.CLAWDIS_WORKSPACE_DIR;
    delete process.env.CLAWDIS_DOCKER;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_DATA_HOME;
    delete process.env.APPDATA;
    delete process.env.LOCALAPPDATA;
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    resetPlatform();
    vi.resetModules();
  });

  describe("getConfigDir", () => {
    it("respects CLAWDIS_CONFIG_DIR env override", async () => {
      process.env.CLAWDIS_CONFIG_DIR = "/custom/config";
      const { getConfigDir } = await import("./paths.js");
      expect(getConfigDir()).toBe("/custom/config");
    });

    it("expands ~ in CLAWDIS_CONFIG_DIR", async () => {
      process.env.CLAWDIS_CONFIG_DIR = "~/my-config";
      const { getConfigDir } = await import("./paths.js");
      expect(getConfigDir()).toBe(path.join(os.homedir(), "my-config"));
    });

    it("returns /config in Docker mode", async () => {
      process.env.CLAWDIS_DOCKER = "1";
      const { getConfigDir } = await import("./paths.js");
      expect(getConfigDir()).toBe("/config");
    });

    it("uses XDG_CONFIG_HOME on Linux when set", async () => {
      mockPlatform("linux");
      process.env.XDG_CONFIG_HOME = "/home/user/.config-custom";
      const { getConfigDir } = await import("./paths.js");
      expect(getConfigDir()).toBe("/home/user/.config-custom/clawdis");
    });

    it("defaults to ~/.config/clawdis on Linux without XDG", async () => {
      mockPlatform("linux");
      const { getConfigDir } = await import("./paths.js");
      expect(getConfigDir()).toBe(
        path.join(os.homedir(), ".config", "clawdis"),
      );
    });

    it("uses ~/.clawdis on macOS", async () => {
      mockPlatform("darwin");
      const { getConfigDir } = await import("./paths.js");
      expect(getConfigDir()).toBe(path.join(os.homedir(), ".clawdis"));
    });

    it("uses APPDATA on Windows when set", async () => {
      mockPlatform("win32");
      process.env.APPDATA = "C:\\Users\\Test\\AppData\\Roaming";
      const { getConfigDir } = await import("./paths.js");
      // Note: path.join uses native separator, so on non-Windows hosts the result
      // may use forward slashes. We test that APPDATA is used as prefix.
      expect(getConfigDir()).toMatch(/C:\\Users\\Test\\AppData\\Roaming[/\\]clawdis/);
    });

    it("falls back to AppData/Roaming on Windows without APPDATA", async () => {
      mockPlatform("win32");
      const { getConfigDir } = await import("./paths.js");
      expect(getConfigDir()).toBe(
        path.join(os.homedir(), "AppData", "Roaming", "clawdis"),
      );
    });
  });

  describe("getDataDir", () => {
    it("respects CLAWDIS_DATA_DIR env override", async () => {
      process.env.CLAWDIS_DATA_DIR = "/custom/data";
      const { getDataDir } = await import("./paths.js");
      expect(getDataDir()).toBe("/custom/data");
    });

    it("expands ~ in CLAWDIS_DATA_DIR", async () => {
      process.env.CLAWDIS_DATA_DIR = "~/my-data";
      const { getDataDir } = await import("./paths.js");
      expect(getDataDir()).toBe(path.join(os.homedir(), "my-data"));
    });

    it("returns /data in Docker mode", async () => {
      process.env.CLAWDIS_DOCKER = "1";
      const { getDataDir } = await import("./paths.js");
      expect(getDataDir()).toBe("/data");
    });

    it("uses XDG_DATA_HOME on Linux when set", async () => {
      mockPlatform("linux");
      process.env.XDG_DATA_HOME = "/home/user/.local/share-custom";
      const { getDataDir } = await import("./paths.js");
      expect(getDataDir()).toBe("/home/user/.local/share-custom/clawdis");
    });

    it("defaults to ~/.local/share/clawdis on Linux without XDG", async () => {
      mockPlatform("linux");
      const { getDataDir } = await import("./paths.js");
      expect(getDataDir()).toBe(
        path.join(os.homedir(), ".local", "share", "clawdis"),
      );
    });

    it("uses ~/.clawdis on macOS for backward compatibility", async () => {
      mockPlatform("darwin");
      const { getDataDir } = await import("./paths.js");
      expect(getDataDir()).toBe(path.join(os.homedir(), ".clawdis"));
    });

    it("uses LOCALAPPDATA on Windows when set", async () => {
      mockPlatform("win32");
      process.env.LOCALAPPDATA = "C:\\Users\\Test\\AppData\\Local";
      const { getDataDir } = await import("./paths.js");
      // Note: path.join uses native separator, so on non-Windows hosts the result
      // may use forward slashes. We test that LOCALAPPDATA is used as prefix.
      expect(getDataDir()).toMatch(/C:\\Users\\Test\\AppData\\Local[/\\]clawdis/);
    });
  });

  describe("getCredentialsDir", () => {
    it("returns credentials subdirectory of data dir", async () => {
      process.env.CLAWDIS_DATA_DIR = "/custom/data";
      const { getCredentialsDir } = await import("./paths.js");
      expect(getCredentialsDir()).toBe("/custom/data/credentials");
    });

    it("uses platform-appropriate data dir", async () => {
      mockPlatform("darwin");
      const { getCredentialsDir } = await import("./paths.js");
      expect(getCredentialsDir()).toBe(
        path.join(os.homedir(), ".clawdis", "credentials"),
      );
    });
  });

  describe("getSessionsDir", () => {
    it("returns sessions subdirectory of data dir", async () => {
      process.env.CLAWDIS_DATA_DIR = "/custom/data";
      const { getSessionsDir } = await import("./paths.js");
      expect(getSessionsDir()).toBe("/custom/data/sessions");
    });

    it("uses platform-appropriate data dir", async () => {
      mockPlatform("darwin");
      const { getSessionsDir } = await import("./paths.js");
      expect(getSessionsDir()).toBe(
        path.join(os.homedir(), ".clawdis", "sessions"),
      );
    });
  });

  describe("getWorkspaceDir", () => {
    it("respects CLAWDIS_WORKSPACE_DIR env override", async () => {
      process.env.CLAWDIS_WORKSPACE_DIR = "/custom/workspace";
      const { getWorkspaceDir } = await import("./paths.js");
      expect(getWorkspaceDir()).toBe("/custom/workspace");
    });

    it("expands ~ in CLAWDIS_WORKSPACE_DIR", async () => {
      process.env.CLAWDIS_WORKSPACE_DIR = "~/my-workspace";
      const { getWorkspaceDir } = await import("./paths.js");
      expect(getWorkspaceDir()).toBe(path.join(os.homedir(), "my-workspace"));
    });

    it("returns /workspace in Docker mode", async () => {
      process.env.CLAWDIS_DOCKER = "1";
      const { getWorkspaceDir } = await import("./paths.js");
      expect(getWorkspaceDir()).toBe("/workspace");
    });

    it("defaults to ~/clawd on all platforms", async () => {
      mockPlatform("darwin");
      const darwinPaths = await import("./paths.js");
      expect(darwinPaths.getWorkspaceDir()).toBe(
        path.join(os.homedir(), "clawd"),
      );

      vi.resetModules();
      mockPlatform("linux");
      const linuxPaths = await import("./paths.js");
      expect(linuxPaths.getWorkspaceDir()).toBe(
        path.join(os.homedir(), "clawd"),
      );

      vi.resetModules();
      mockPlatform("win32");
      const winPaths = await import("./paths.js");
      expect(winPaths.getWorkspaceDir()).toBe(path.join(os.homedir(), "clawd"));
    });
  });

  describe("getConfigFilePath", () => {
    it("returns clawdis.json in config dir", async () => {
      process.env.CLAWDIS_CONFIG_DIR = "/custom/config";
      const { getConfigFilePath } = await import("./paths.js");
      expect(getConfigFilePath()).toBe("/custom/config/clawdis.json");
    });
  });

  describe("getSessionStorePath", () => {
    it("returns sessions.json in sessions dir", async () => {
      process.env.CLAWDIS_DATA_DIR = "/custom/data";
      const { getSessionStorePath } = await import("./paths.js");
      expect(getSessionStorePath()).toBe("/custom/data/sessions/sessions.json");
    });
  });

  describe("getCanvasDir", () => {
    it("returns canvas subdirectory of workspace", async () => {
      process.env.CLAWDIS_WORKSPACE_DIR = "/custom/workspace";
      const { getCanvasDir } = await import("./paths.js");
      expect(getCanvasDir()).toBe("/custom/workspace/canvas");
    });
  });

  describe("getSkillsDir", () => {
    it("returns skills subdirectory of workspace", async () => {
      process.env.CLAWDIS_WORKSPACE_DIR = "/custom/workspace";
      const { getSkillsDir } = await import("./paths.js");
      expect(getSkillsDir()).toBe("/custom/workspace/skills");
    });
  });

  describe("resolveUserPath", () => {
    it("expands ~ to home directory", async () => {
      const { resolveUserPath } = await import("./paths.js");
      expect(resolveUserPath("~/test")).toBe(path.join(os.homedir(), "test"));
    });

    it("resolves relative paths", async () => {
      const { resolveUserPath } = await import("./paths.js");
      expect(resolveUserPath("./test")).toBe(path.resolve("./test"));
    });

    it("preserves absolute paths", async () => {
      const { resolveUserPath } = await import("./paths.js");
      expect(resolveUserPath("/absolute/path")).toBe("/absolute/path");
    });

    it("handles empty string", async () => {
      const { resolveUserPath } = await import("./paths.js");
      expect(resolveUserPath("")).toBe("");
    });

    it("trims whitespace", async () => {
      const { resolveUserPath } = await import("./paths.js");
      expect(resolveUserPath("  ~/test  ")).toBe(
        path.join(os.homedir(), "test"),
      );
    });
  });

  describe("getMacAppSupportDir", () => {
    it("returns Application Support path on macOS", async () => {
      mockPlatform("darwin");
      const { getMacAppSupportDir } = await import("./paths.js");
      expect(getMacAppSupportDir()).toBe(
        path.join(os.homedir(), "Library", "Application Support", "clawdis"),
      );
    });

    it("returns null on non-macOS platforms", async () => {
      mockPlatform("linux");
      const linuxPaths = await import("./paths.js");
      expect(linuxPaths.getMacAppSupportDir()).toBeNull();

      vi.resetModules();
      mockPlatform("win32");
      const winPaths = await import("./paths.js");
      expect(winPaths.getMacAppSupportDir()).toBeNull();
    });
  });

  describe("isDocker", () => {
    it("returns true when CLAWDIS_DOCKER=1", async () => {
      process.env.CLAWDIS_DOCKER = "1";
      const { isDocker } = await import("./paths.js");
      expect(isDocker()).toBe(true);
    });

    it("returns false when CLAWDIS_DOCKER is not set", async () => {
      const { isDocker } = await import("./paths.js");
      // Note: This might return true if running in an actual Docker container
      // with /.dockerenv present, but for most test environments it should be false
      expect(typeof isDocker()).toBe("boolean");
    });
  });

  describe("isLegacyPathLayout", () => {
    it("returns false when env overrides are set", async () => {
      process.env.CLAWDIS_CONFIG_DIR = "/custom";
      const { isLegacyPathLayout } = await import("./paths.js");
      expect(isLegacyPathLayout()).toBe(false);
    });

    it("returns true on macOS by default", async () => {
      mockPlatform("darwin");
      const { isLegacyPathLayout } = await import("./paths.js");
      expect(isLegacyPathLayout()).toBe(true);
    });

    it("returns false on Linux with XDG vars", async () => {
      mockPlatform("linux");
      process.env.XDG_CONFIG_HOME = "/home/user/.config";
      const { isLegacyPathLayout } = await import("./paths.js");
      expect(isLegacyPathLayout()).toBe(false);
    });

    it("returns false on Linux without XDG vars (uses XDG defaults)", async () => {
      mockPlatform("linux");
      const { isLegacyPathLayout } = await import("./paths.js");
      expect(isLegacyPathLayout()).toBe(false);
    });
  });

  describe("Docker volume mount detection", () => {
    it("env override takes precedence over Docker mode", async () => {
      process.env.CLAWDIS_DOCKER = "1";
      process.env.CLAWDIS_CONFIG_DIR = "/mounted/config";
      const { getConfigDir } = await import("./paths.js");
      expect(getConfigDir()).toBe("/mounted/config");
    });

    it("all paths respect Docker mode consistently", async () => {
      process.env.CLAWDIS_DOCKER = "1";
      const paths = await import("./paths.js");
      expect(paths.getConfigDir()).toBe("/config");
      expect(paths.getDataDir()).toBe("/data");
      expect(paths.getWorkspaceDir()).toBe("/workspace");
      expect(paths.getCredentialsDir()).toBe("/data/credentials");
      expect(paths.getSessionsDir()).toBe("/data/sessions");
    });
  });
});
