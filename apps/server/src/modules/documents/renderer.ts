import type { Renderer } from "./renderer-client.js";
import { createUnixSocketRenderer } from "./renderer-client.js";

export interface RendererClientConfig {
  readonly socketPath: string;
  readonly timeoutMs?: number;
  readonly rendererVersion?: string;
}

/** Composition-friendly renderer factory; the socket is never client supplied. */
export function createDocumentRenderer(config: RendererClientConfig): Renderer {
  return createUnixSocketRenderer(
    config.socketPath,
    config.timeoutMs,
    config.rendererVersion,
  );
}
