import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkGit,
  checkNode,
  checkPnpm,
  runAllPrerequisiteChecks,
} from "./prerequisites.js";

describe("prerequisites", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("runAllPrerequisiteChecks", () => {
    it("should return checks array with results", async () => {
      const report = await runAllPrerequisiteChecks();

      expect(report.checks).toBeDefined();
      expect(Array.isArray(report.checks)).toBe(true);
      expect(report.checks.length).toBeGreaterThan(0);
    });

    it("should calculate summary correctly", async () => {
      const report = await runAllPrerequisiteChecks();

      const total =
        report.passed + report.warnings + report.errors + report.skipped;
      expect(total).toBe(report.checks.length);
    });

    it("should include Node.js check with ok status in current environment", async () => {
      const report = await runAllPrerequisiteChecks();

      const nodeResult = report.checks.find((r) => r.name === "Node.js");
      expect(nodeResult).toBeDefined();
      expect(nodeResult?.status).toBe("ok");
      expect(nodeResult?.version).toBeDefined();
    });

    it("should have allRequiredPassed boolean", async () => {
      const report = await runAllPrerequisiteChecks();
      expect(typeof report.allRequiredPassed).toBe("boolean");
    });
  });

  describe("runAllPrerequisiteChecks with requiredOnly option", () => {
    it("should only run required checks when requiredOnly is true", async () => {
      const fullReport = await runAllPrerequisiteChecks();
      const requiredReport = await runAllPrerequisiteChecks({
        requiredOnly: true,
      });

      // Required-only should have fewer checks
      expect(requiredReport.checks.length).toBeLessThan(fullReport.checks.length);
    });

    it("should not include optional checks", async () => {
      const report = await runAllPrerequisiteChecks({ requiredOnly: true });

      const names = report.checks.map((r) => r.name);
      // These are optional checks that should not be included
      expect(names).not.toContain("pnpm");
      expect(names).not.toContain("Git");
      expect(names).not.toContain("FFmpeg");
      expect(names).not.toContain("Tailscale");
    });
  });

  describe("individual check functions", () => {
    it("checkNode should return ok in dev environment", async () => {
      const result = await checkNode();

      expect(result.name).toBe("Node.js");
      expect(result.status).toBe("ok");
      expect(result.version).toBeDefined();
      expect(result.required).toBe(true);
    });

    it("checkPnpm should return ok in dev environment", async () => {
      const result = await checkPnpm();

      expect(result.name).toBe("pnpm");
      expect(result.status).toBe("ok");
      expect(result.version).toBeDefined();
      expect(result.required).toBe(false);
    });

    it("checkGit should return result with correct structure", async () => {
      const result = await checkGit();

      expect(result.name).toBe("Git");
      expect(result.id).toBe("git");
      expect(["ok", "warning", "error", "skipped"]).toContain(result.status);
      expect(result.message).toBeDefined();
      expect(result.required).toBe(false);
    });
  });

  describe("check result structure", () => {
    it("result objects should have required fields", async () => {
      const report = await runAllPrerequisiteChecks();

      for (const result of report.checks) {
        expect(result.id).toBeDefined();
        expect(result.name).toBeDefined();
        expect(result.status).toMatch(/^(ok|warning|error|skipped)$/);
        expect(result.message).toBeDefined();
        expect(typeof result.required).toBe("boolean");
      }
    });

    it("error and warning results may have fix hints", async () => {
      const report = await runAllPrerequisiteChecks();

      for (const result of report.checks) {
        if (result.status === "error" || result.status === "warning") {
          // fix field is optional but should be string if present
          expect(
            typeof result.fix === "string" || result.fix === undefined,
          ).toBe(true);
        }
      }
    });
  });
});
