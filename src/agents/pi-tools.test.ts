import { describe, expect, it } from "vitest";
import { createClawdisCodingTools } from "./pi-tools.js";

describe("createClawdisCodingTools", () => {
  it("merges properties for union tool schemas and removes anyOf", () => {
    const tools = createClawdisCodingTools();
    const browser = tools.find((tool) => tool.name === "clawdis_browser");
    expect(browser).toBeDefined();
    const parameters = browser?.parameters as {
      anyOf?: unknown[];
      oneOf?: unknown[];
      allOf?: unknown[];
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    // anyOf/oneOf/allOf should be removed after normalization (Anthropic doesn't support them at top level)
    expect(parameters.anyOf).toBeUndefined();
    expect(parameters.oneOf).toBeUndefined();
    expect(parameters.allOf).toBeUndefined();
    // Schema should be flattened to a regular object type with merged properties
    expect(parameters.type).toBe("object");
    expect(parameters.properties?.action).toBeDefined();
    expect(parameters.properties?.controlUrl).toBeDefined();
    expect(parameters.properties?.targetUrl).toBeDefined();
    expect(parameters.properties?.request).toBeDefined();
    expect(parameters.required ?? []).toContain("action");
  });

  it("flattens all clawdis tools to remove anyOf/oneOf/allOf", () => {
    const tools = createClawdisCodingTools();
    const clawdisTools = tools.filter((tool) =>
      tool.name.startsWith("clawdis_"),
    );

    // All clawdis tools should have anyOf/oneOf/allOf removed
    for (const tool of clawdisTools) {
      const parameters = tool.parameters as {
        anyOf?: unknown[];
        oneOf?: unknown[];
        allOf?: unknown[];
        type?: string;
        properties?: Record<string, unknown>;
      };
      expect(parameters.anyOf).toBeUndefined();
      expect(parameters.oneOf).toBeUndefined();
      expect(parameters.allOf).toBeUndefined();
      expect(parameters.type).toBe("object");
      expect(parameters.properties).toBeDefined();
    }

    // Verify action enum values are preserved in merged schema for browser tool
    const browser = clawdisTools.find(
      (tool) => tool.name === "clawdis_browser",
    );
    expect(browser).toBeDefined();
    const browserParams = browser?.parameters as {
      properties?: Record<string, { enum?: string[] }>;
    };
    const actionEnum = browserParams.properties?.action?.enum ?? [];
    expect(actionEnum).toContain("status");
    expect(actionEnum).toContain("start");
    expect(actionEnum).toContain("stop");
    expect(actionEnum).toContain("tabs");
    expect(actionEnum).toContain("open");
  });

  it("includes bash and process tools", () => {
    const tools = createClawdisCodingTools();
    expect(tools.some((tool) => tool.name === "bash")).toBe(true);
    expect(tools.some((tool) => tool.name === "process")).toBe(true);
  });
});
