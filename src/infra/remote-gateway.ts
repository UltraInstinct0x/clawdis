/**
 * Remote gateway client helpers.
 *
 * When gateway.mode is "remote", the CLI connects to an external gateway
 * instead of starting one locally. This module provides helpers for
 * resolving remote gateway connection details.
 */

import { loadConfig } from "../config/config.js";

/**
 * Remote gateway configuration from clawdis.json or environment.
 */
export type RemoteGatewayConfig = {
  url: string;
  token?: string;
};

/**
 * Get the remote gateway URL.
 *
 * Priority:
 * 1. CLAWDIS_GATEWAY_URL env var
 * 2. gateway.remote.url from config
 * 3. Default: null (no remote gateway configured)
 */
export function getGatewayUrl(): string | null {
  // Env override takes precedence
  const envUrl = process.env.CLAWDIS_GATEWAY_URL;
  if (envUrl) {
    return normalizeGatewayUrl(envUrl);
  }

  // Config file
  const config = loadConfig();
  const remoteUrl = config.gateway?.remote?.url;
  if (remoteUrl) {
    return normalizeGatewayUrl(remoteUrl);
  }

  return null;
}

/**
 * Get the remote gateway authentication token.
 *
 * Priority:
 * 1. CLAWDIS_GATEWAY_TOKEN env var
 * 2. gateway.remote.token from config
 * 3. Default: undefined (no token)
 */
export function getGatewayToken(): string | undefined {
  // Env override takes precedence
  const envToken = process.env.CLAWDIS_GATEWAY_TOKEN;
  if (envToken) {
    return envToken;
  }

  // Config file
  const config = loadConfig();
  return config.gateway?.remote?.token;
}

/**
 * Check if the gateway is configured as remote.
 *
 * Returns true if:
 * 1. CLAWDIS_GATEWAY_URL is set, or
 * 2. gateway.mode is "remote" in config, or
 * 3. gateway.remote.url is set in config
 */
export function isRemoteGateway(): boolean {
  // Explicit env var for remote gateway
  if (process.env.CLAWDIS_GATEWAY_URL) {
    return true;
  }

  const config = loadConfig();

  // Explicit mode setting
  if (config.gateway?.mode === "remote") {
    return true;
  }

  // Remote URL configured
  if (config.gateway?.remote?.url) {
    return true;
  }

  return false;
}

/**
 * Get the full remote gateway configuration if available.
 * Returns null if not configured for remote mode.
 */
export function getRemoteGatewayConfig(): RemoteGatewayConfig | null {
  const url = getGatewayUrl();
  if (!url) {
    return null;
  }

  return {
    url,
    token: getGatewayToken(),
  };
}

/**
 * Normalize a gateway URL to ensure it's properly formatted.
 * - Ensures https:// prefix for non-localhost URLs
 * - Removes trailing slashes
 * - Validates URL format
 */
function normalizeGatewayUrl(url: string): string {
  let normalized = url.trim();

  // Add protocol if missing
  if (!normalized.match(/^https?:\/\//i)) {
    // Use http for localhost, https for everything else
    const isLocalhost =
      normalized.startsWith("localhost") ||
      normalized.startsWith("127.0.0.1") ||
      normalized.startsWith("0.0.0.0");
    normalized = `${isLocalhost ? "http" : "https"}://${normalized}`;
  }

  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, "");

  // Validate URL format
  try {
    new URL(normalized);
  } catch {
    throw new Error(`Invalid gateway URL: ${url}`);
  }

  return normalized;
}

/**
 * Build a WebSocket URL from an HTTP gateway URL.
 * Converts http:// to ws:// and https:// to wss://.
 */
export function toWebSocketUrl(httpUrl: string): string {
  return httpUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

/**
 * Check if the remote gateway is reachable.
 * Performs a simple health check request.
 */
export async function checkRemoteGatewayHealth(
  url: string,
  timeoutMs = 5000,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${url}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return { ok: true };
    }

    return {
      ok: false,
      error: `Gateway returned status ${response.status}`,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error connecting to gateway";
    return { ok: false, error: message };
  }
}
