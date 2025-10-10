/**
 * =============================================================================
 * IMPORTANT NOTICE: Undocumented Datastar API Usage
 * =============================================================================
 *
 * This file contains code that relies on UNDOCUMENTED and INTERNAL Datastar
 * mechanisms, including but not limited to:
 *
 *   - Dispatching `datastar-signal-patch` custom events
 *   - Creating custom Datastar watcher plugins
 *   - Intercepting and wrapping Datastar action functions (ctx.actions)
 *   - Manipulating Datastar request headers and arguments
 *   - Using plugin context APIs that may be internal-only
 *
 * ⚠️ THESE ARE NOT PART OF DATASTAR'S PUBLIC API ⚠️
 *
 * This code works by hooking into Datastar's internals which may change or be
 * removed at any time in future versions without notice or backwards
 * compatibility. Breaking changes are likely when upgrading Datastar.
 *
 * COMPATIBILITY & VERSION REQUIREMENTS:
 *
 *   - Compatible Datastar Version: v1.0.0-RC.5
 *   - DO NOT upgrade Datastar without verifying compatibility
 *   - The maintainer will make efforts to keep this code compatible with new
 *     Datastar versions, but updates may lag behind Datastar releases
 *   - Only use Datastar versions explicitly marked as compatible
 *
 * If Datastar provides official public APIs for these capabilities in the
 * future, this code likely wil be refactored to use those instead.
 *
 * Community contributions, pull requests, and compatibility updates for new
 * Datastar versions are more than welcome and greatly appreciated!
 *
 * =============================================================================
 */

import { ElementIndex, FetchIdToElement } from "./shared.js";
import { InterceptorLogger } from "./interceptor.js";

export const DATASTAR_DEBUG_SIGNAL_EVENT = "debug-datastar-signal";

export function FetchReturn(response, transformStream) {
  // Create new response with transformed body
  // IMPORTANT: This is compatible with Datastar's fetch handling because:
  // 1. For SSE streams: Datastar uses response.body directly
  //    - Our transformed stream works perfectly with getBytes(response.body)
  // 2. For HTML/JSON: Datastar calls response.text()
  //    - Response.text() works on our transformed ReadableStream
  // 3. Response object properly exposes the transformed body through both
  //    response.body (as ReadableStream) and response.text() (as Promise<string>)
  const transformedBody = response.body.pipeThrough(transformStream);

  return new Response(transformedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

const FetchIdHeader = "X-Fetch-Id";

/**
 * Dispatches a custom event to update Datastar signals.
 *
 * @param {object} signals - An object where keys are signal names and values are the new signal values.
 */
export function SendSignal(signal) {
  // The detail object simulates the structure of a datastar-patch-signals event.
  const detail = {
    type: "datastar-patch-signals",
    argsRaw: {
      signals: JSON.stringify(signal),
    },
  };

  // Dispatch a 'datastar-fetch' event to be caught by the PatchSignals watcher.
  document.dispatchEvent(new CustomEvent("datastar-fetch", { detail }));
}

/**
 * Connection state values for Datastar signals.
 * Used with Retryer's enableDatastarSignals option.
 *
 * @constant
 * @type {{CONNECTING: string, CONNECTED: string, DISCONNECTED: string}}
 */
export const SIGNALS_CONNECTION_STATES = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
};

// counter for generating unique fetch IDs
let fetchCounter = 0;

const DatastarPlugin = {
  type: "watcher",
  name: "element-fetch-mapper",
  onGlobalInit: (ctx) => {
    // inject X-Fetch-Id header into all "ctx.actions".
    // these will be picked up by the fetch interceptor
    // so we can track which fetch belongs to which element.
    //
    // this mapping bridges the gap between Datastar actions (which have element context)
    // and window.fetch (which doesnt), allowing us to retrieve the Retryer instance.

    for (const actionName in ctx.actions) {
      const original = ctx.actions[actionName].fn;
      // this wrapper executes on EVERY request (e.g., every @get, @post call)
      ctx.actions[actionName].fn = (actionCtx, url, args = {}) => {
        // only modify elements with a Retryer instance
        const hasRetryer = !!ElementIndex.get(actionCtx.el);
        if (!hasRetryer) {
          return original(actionCtx, url, args);
        }

        const fetchId = `${++fetchCounter}`;
        FetchIdToElement.set(fetchId, actionCtx.el);
        // cleanup fallback: normally deleted immediately at when fetch executes.
        // this 5s timeout only fires if fetch never gets called (e.g., error before fetch starts).
        setTimeout(() => FetchIdToElement.delete(fetchId), 5000);
        args.headers = { ...args.headers, [FetchIdHeader]: fetchId };

        // disable datastar built-in retry mechanism since we handle retries via the Retryer.
        // setting retryMaxCount to 0 prevents any retries, but Datastar will still reject
        // with a FetchFailed error wrapping "Max retries reached."
        // we catch and suppress this error below to avoid console spam.
        args.retryMaxCount = 0;

        return original(actionCtx, url, args).catch((error) => {
          // Suppress Datastar's FetchFailed errors since our Retryer handles reconnection.
          if (error?.message?.startsWith("FetchFailed")) {
            InterceptorLogger.info(
              `[Interceptor] Suppressed Datastar FetchFailed error, Retryer will handle reconnection for:`,
              actionCtx.el
            );
            return; // resolve with undefined
          }
          throw error; // re-throw other errors
        });
      };
    }
  },
};

export function LoadDatastarPlugin(load) {
  try {
    load(DatastarPlugin);
  } catch (e) {
    console.error("[Interceptor] Failed to load DatastarPlugin", e);
  }
}
