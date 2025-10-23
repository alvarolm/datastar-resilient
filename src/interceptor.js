import {
  RETRYER_BYPASS_KEY,
  Logger,
  ElementIndex,
  FetchIdToElement,
} from "./shared.js";
import { Retryer } from "./retryer.js";
import { FetchReturn } from "./datastar.js";

const FetchIdHeader = "X-Fetch-Id";

/**
 * Logger instance for the fetch interceptor.
 * Use ToggleInterceptorLogging() to control output.
 *
 * @type {Logger}
 */
export const InterceptorLogger = new Logger(false);

/**
 * Enables or disables console logging for the fetch interceptor.
 * Logs fetch lifecycle events, errors, and debug information.
 *
 * @param {boolean} enabled - true to enable logging, false to disable
 *
 * @example
 * ToggleInterceptorLogging(true);  // enable logging
 * ToggleInterceptorLogging(false); // disable logging
 */
export function ToggleInterceptorLogging(enabled) {
  InterceptorLogger.enabled = enabled;
}

/**
 * Creates a TransformStream to process the response body stream.
 * Applies the dataInterceptor if configured, then enqueues chunks to the stream.
 *
 * @param {Object} params
 * @param {string} params.url
 * @param {Response} params.response
 * @param {Retryer|null} params.retryer
 * @returns {TransformStream} A TransformStream that processes chunks with optional data modification
 */
const fetchStreamTransformer = function ({ url, response, retryer }) {
  return new TransformStream({
    async transform(chunk, controller) {
      retryer?.trackSSE(RETRYER_BYPASS_KEY);

      try {
        // allow user to modify received data
        if (retryer?.options.dataInterceptor) {
          chunk =
            retryer.options.dataInterceptor({ url, response, chunk }) ?? chunk;
        }

        // return data to stream
        controller.enqueue(chunk);
      } catch (e) {
        InterceptorLogger.error(
          "[Interceptor] Error in stream transformer:",
          e
        );
        controller.error(e);
      }
    },
  });
};

const originalFetch = window.fetch;

/**
 * Intercepts all fetch requests to incorporate retry logic and request/response modification.
 * Only requests associated with a Retryer instance are affected.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch
 *
 * @param {string | URL | Request} resource - The URL or Request object to fetch
 * @param {RequestInit} [init] - Fetch options (optional)
 * @returns {Promise<Response>} The fetch response with (optionally) transformed response
 */
window.fetch = async function (resource, init) {
  const { retryer } = getRetryer(resource, init);

  if (!retryer) {
    InterceptorLogger.info(
      "[Interceptor] No Retryer associated with fetch, calling original fetch."
    );
    return originalFetch(resource, init);
  }

  InterceptorLogger.info(
    "[Interceptor] Intercepted fetch with Retryer:",
    retryer
  );

  if (retryer.options.requestInterceptor) {
    ({ resource, init } = retryer.options.requestInterceptor({
      resource,
      init,
    }));
  }

  const isRequestObject = resource instanceof Request;
  const url = isRequestObject ? resource.url : resource;

  // create a new abort controller to manage fetch abortion
  const abortController = new AbortController();

  // if there is an original signal, listen to it and forward the abort
  if (init?.signal) {
    init.signal.aborted
      ? abortController.abort(init.signal.reason)
      : init.signal.addEventListener(
          "abort",
          () => abortController.abort(init.signal.reason),
          { once: true }
        );
  }

  const newOptions = { ...init, signal: abortController.signal };

  let response;

  retryer.notifyRequestStarted(RETRYER_BYPASS_KEY);
  retryer.setAbortController(RETRYER_BYPASS_KEY, abortController);

  try {
    // Call originalFetch with the appropriate parameters
    if (isRequestObject) {
      // For Request objects, we may have recreated it with modifications
      // Pass the (possibly new) Request object with merged options
      response = await originalFetch(resource, newOptions);
    } else {
      // For url/options, pass them directly
      response = await originalFetch(url, newOptions);
    }

    if (retryer.isFailedRequest(RETRYER_BYPASS_KEY, response)) {
      // abort to let the server server know we are giving up on this request
      abortController.abort(
        "[Interceptor] Fetch aborted by retryer: unexpected response"
      );

      InterceptorLogger.warn(
        `[Interceptor] Fetch aborted by retryer: unexpected response for ${url}`,
        response
      );

      // throw to inform of failure
      throw new Error(
        "[Interceptor] Fetch aborted by retryer: unexpected response"
      );
    } else {
      retryer.notifyRequestConnected(RETRYER_BYPASS_KEY);
    }
  } catch (e) {
    retryer.notifyRequestStopped(RETRYER_BYPASS_KEY);
    throw e;
  }

  InterceptorLogger.info(
    `[Interceptor] fetch response: ${response.status} ${response.statusText} for ${url}`,
    response
  );

  if (retryer.options.responseInterceptor) {
    response =
      retryer.options.responseInterceptor({ url, response }) ?? response;
  }

  if (!response.body) {
    InterceptorLogger.info(
      "[Interceptor] response has no body, skipping transformation, for url:",
      url
    );

    return response;
  }

  const transformStream = fetchStreamTransformer({
    url,
    response,
    retryer,
  });

  return FetchReturn(response, transformStream);
};

/**
 * Extracts the Retryer instance from fetch parameters.
 * Handles both regular fetch(url, options) and fetch(Request, options) signatures.
 * Priority: init headers > Request headers
 *
 * @param {string | URL | Request} resource - The URL or Request object
 * @param {RequestInit} [init] - Optional fetch options
 * @returns {{ retryer: Retryer | null }}
 */
function getRetryer(resource, init) {
  // Determine if resource is Request object (for header extraction)
  const isRequestObject = resource instanceof Request;

  // Extract fetch ID from headers (priority: init headers > Request headers)
  let fetchId = null;
  let headersToClean = null;

  // Check init headers first
  if (init?.headers) {
    fetchId =
      init.headers instanceof Headers
        ? init.headers.get(FetchIdHeader)
        : init.headers?.[FetchIdHeader];

    if (fetchId) {
      headersToClean = init.headers;
    }
  }

  // Check Request headers if not found in init
  if (!fetchId && isRequestObject) {
    fetchId = resource.headers.get(FetchIdHeader);
    if (fetchId) {
      // Request.headers is readonly, cannot clean it
      headersToClean = null;
    }
  }

  // If no fetch ID found, return null retryer
  if (!fetchId) {
    return { retryer: null };
  }

  // Remove FetchIdHeader from headers (if mutable)
  if (headersToClean) {
    if (headersToClean instanceof Headers) {
      headersToClean.delete(FetchIdHeader);
    } else if (typeof headersToClean === "object") {
      delete headersToClean[FetchIdHeader];
    }
  }

  // Find associated element
  const element = FetchIdToElement.get(fetchId);

  // Clean up FetchIdToElement map
  FetchIdToElement.delete(fetchId);

  // Validate element exists
  if (!element) {
    InterceptorLogger.error(
      "[Interceptor] No element found for fetchId:",
      fetchId
    );
    return { retryer: null };
  }

  // Validate element is still in DOM
  if (!document.contains(element)) {
    InterceptorLogger.error(
      "[Interceptor] Element for fetchId is no longer in DOM:",
      fetchId,
      element
    );
    return { retryer: null };
  }

  // Find and validate retryer
  const retryer = ElementIndex.get(element);
  if (!retryer || !(retryer instanceof Retryer)) {
    InterceptorLogger.error(
      "[Interceptor] No Retryer instance found for element:",
      element
    );
    return { retryer: null };
  }

  return { retryer };
}
