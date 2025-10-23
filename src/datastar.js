/**
 * =============================================================================
 * IMPORTANT NOTICE: Undocumented Datastar API Usage
 * =============================================================================
 *
 * This file contains code that relies on UNDOCUMENTED and INTERNAL Datastar
 * mechanisms, including but not limited to:
 *
 *   - Dispatching custom Datastar events
 *   - Wrapping Datastar action plugins
 *   - Manipulating Datastar request headers and arguments
 *   - Accessing internal action implementations
 *
 * ⚠️ THE DATASTAR API HAS NO STABILITY GUARANTEES AND MAY CHANGE AT ANY MOMENT ⚠️
 *
 * This code works by hooking into Datastar's API which may change or be
 * removed at any time in future versions without notice or backwards
 * compatibility. Breaking changes are likely when upgrading Datastar.
 *
 * COMPATIBILITY & VERSION REQUIREMENTS:
 *
 *   - This library aims to be compatible with the latest version of Datastar
 *   - Currently compatible with: v1.0.0-RC.6
 *   - For support with older versions (v1.0.0-RC.5), see MIGRATION.md
 *   - DO NOT upgrade Datastar without verifying compatibility
 *   - The maintainer will make efforts to keep this code compatible with new
 *     Datastar versions, but updates may lag behind Datastar releases
 *
 * Community contributions, pull requests, and compatibility updates for new
 * Datastar versions are more than welcome and greatly appreciated!
 *
 * =============================================================================
 */

import { ElementIndex, FetchIdToElement } from "./shared.js";
import { InterceptorLogger } from "./interceptor.js";

const DATASTAR_FETCH_EVENT = "datastar-fetch";
const DATASTAR_SIGNAL_PATCH_EVENT = "datastar-signal-patch";

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
  document.dispatchEvent(new CustomEvent(DATASTAR_FETCH_EVENT, { detail }));
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

// Store references to original fetch actions
// const originalActions = {};

/**
 * Wraps a Datastar fetch action to inject X-Fetch-Id headers and disable retries.
 * This wrapper executes on get and post requests (e.g., @get and @post calls).
 *
 * @param {Function} originalAction - The original action function
 * @returns {Function} The wrapped action function
 */
function wrapFetchAction(originalAction) {
  return async (ctx, url, args = {}) => {
    // only modify elements with a Retryer instance
    const hasRetryer = !!ElementIndex.get(ctx.el);
    if (!hasRetryer) {
      return originalAction(ctx, url, args);
    }

    const fetchId = `${++fetchCounter}`;
    FetchIdToElement.set(fetchId, ctx.el);
    // cleanup fallback: normally deleted immediately when fetch executes.
    // this 5s timeout only fires if fetch never gets called (e.g., error before fetch starts).
    setTimeout(() => FetchIdToElement.delete(fetchId), 5000);
    args.headers = { ...args.headers, [FetchIdHeader]: fetchId };

    // disable datastar built-in retry mechanism since we handle retries via the Retryer.
    // setting retryMaxCount to 0 prevents any retries, but Datastar will still reject
    // with an error, we catch and suppress this error below to avoid console spam.
    args.retryMaxCount = 0;

    try {
      return await originalAction(ctx, url, args);
    } catch (error) {
      // suppress Datastar's FetchFailed errors since our Retryer handles reconnection.
      if (error?.message?.startsWith("FetchFailed")) {
        InterceptorLogger.info(
          `[Interceptor] Suppressed Datastar FetchFailed error, Retryer will handle reconnection for:`,
          ctx.el
        );
        return; // resolve with undefined
      }
      throw error; // re-throw other errors
    }
  };
}

/**
 * Loads the Datastar plugin by wrapping fetch actions.
 * This must be called AFTER Datastar is imported but BEFORE any Datastar attributes are processed.
 *
 * @param {Object} datastarExports - The Datastar exports object containing { action, actions }
 * @param {Function} datastarExports.action - The action registration function from Datastar
 * @param {Object} datastarExports.actions - The actions object from Datastar
 *
 * @example
 * // Datastar v1.0.0-RC.6
 * import { action, actions } from 'datastar';
 * LoadDatastarPlugin({ action, actions });
 */
export function LoadDatastarPlugin(datastarExports) {
  try {
    const { action, actions } = datastarExports;

    if (!action || !actions) {
      throw new Error(
        "LoadDatastarPlugin requires { action, actions } from Datastar v1.0.0-RC.6. " +
        "Import them from your Datastar bundle and pass them to LoadDatastarPlugin."
      );
    }

    // wrap fetch actions
    const fetchActions = ["get", "post"];

    for (const actionName of fetchActions) {
      const originalAction = actions[actionName];

      if (!originalAction) {
        throw new Error(
          `[Resilient] Action '${actionName}' not found in Datastar. ` +
          `Cannot wrap missing action.`
        );
      }

      // save original for reference
      // originalActions[actionName] = originalAction;

      // register wrapped action
      action({
        name: actionName,
        apply: wrapFetchAction(originalAction),
      });

      InterceptorLogger.info(`[Resilient] Wrapped Datastar action: ${actionName}`);
    }

    InterceptorLogger.info("[Resilient] Successfully loaded Datastar plugin");
  } catch (e) {
    console.error("[Resilient] Failed to load DatastarPlugin:", e);
    throw e;
  }
}
