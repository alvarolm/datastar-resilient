import {
  RETRYER_BYPASS_KEY,
  CONNECT_EVENT,
  CONNECTED_EVENT,
  DISCONNECTED_EVENT,
  Logger,
  ElementIndex,
} from "./shared.js";

import { SendSignal, SIGNALS_CONNECTION_STATES } from "./datastar.js";

/**
 * Creates a configurable exponential backoff calculator function
 * @param {Object} options - Backoff configuration options
 * @param {number} [options.maxInitialAttempts=3] - Maximum number of quick retries for initial connection
 * @param {number} [options.initialDelayMs=20] - Initial retry delay in milliseconds
 * @param {number} [options.maxDelayMs=30000] - Maximum delay cap in milliseconds
 * @param {number} [options.baseDelayMs=1000] - Base delay multiplier in milliseconds
 * @param {number} [options.baseMultiplier=2] - Base for exponential calculation
 * @returns {Function} Backoff calculator function
 */
export function SimpleBackoffCalculator({
  maxInitialAttempts = 3,
  initialDelayMs = 20,
  maxDelayMs = 30000,
  baseDelayMs = 1000,
  baseMultiplier = 2,
} = {}) {
  let initialRetryCount = 0;

  return function (retryCount, _, reconnections) {
    // Handle initial connection attempts
    if (reconnections === -1) {
      initialRetryCount++;
      if (maxInitialAttempts > 0 && initialRetryCount > maxInitialAttempts) {
        return false;
      }
      return initialDelayMs;
    }

    // Calculate exponential backoff for reconnections
    return Math.min(
      maxDelayMs,
      baseDelayMs * Math.pow(baseMultiplier, retryCount)
    );
  };
}

/**
 * Manages automatic reconnection for SSE connections with configurable backoff.
 * Tracks fetch lifecycle events and handles retry logic when connections fail.
 *
 * @param {HTMLElement} element - The element to attach the retryer to
 * @param {Object} [options={}] - Configuration options
 * @param {boolean} [options.debug=false] - Enable console logging, disabled by default.
 * @param {Function} [options.backoffCalculator] - Function that takes (retryCount, lastStartTime, reconnections) and returns delay in ms or false to stop retrying. retryCount is consecutive attempts, lastStartTime is timestamp of last attempt, reconnections is total successful connections (-1 = initial connection, 0+ = reconnections). Return false to stop reconnection attempts entirely. Default uses exponential backoff capped at 30s, with max 3 attempts for initial connection (reconnections === -1).
 * @param {Function} [options.isFailedRequest] - Function that takes (from fetch) response and returns boolean. Default is response.status >= 400 (https://data-star.dev/essays/im_a_teapot/)
 * @param {number} [options.inactivityTimeoutMs=0] - Time in ms to consider connection inactive if no data received, if value is 0 or not set, inactivity is not checked. Default is 0.
 * @param {boolean} [options.enableConnectionEvents=false] - Enable dispatching of CONNECTED_EVENT and DISCONNECTED_EVENT. Default is false. Note: CONNECT_EVENT is always dispatched regardless of this setting.
 * @param {string} [options.enableDatastarSignals=""] - String key for Datastar signals. If set, sends signals with this key and values: "connecting", "connected", "disconnected". Default is empty (disabled).
 * @param {Function|null} [options.requestInterceptor=null] - Function to modify fetch requests before they execute. Takes ({ resource, init }) and returns { resource, init }. Resource can be string, URL, or Request object. Init is the optional RequestInit. Default is null (no modification).
 * @param {Function|null} [options.responseInterceptor=null] - Function to modify Response object before it's returned to Datastar. Takes ({ url, response }) and returns modified Response. Useful for modifying headers, status, etc. Default is null (no modification).
 * @param {Function|null} [options.dataInterceptor=null] - Function to modify streaming response data chunks. Takes ({ url, response, chunk }) and returns modified chunk. Chunk is a Uint8Array containing binary data. Called for each chunk of the response body. Default is null (no modification).
 */
export class Retryer {
  #logger;

  #lastStartTime;
  #retryCount;
  #retryTimer;
  #connected;
  #lastSSETime;
  #abortController;
  #reconnections;
  #inactivityCheckInterval;

  constructor(element, options = {}) {
    // remove null and undefined values from options
    options = Object.fromEntries(
      Object.entries(options).filter(([_, value]) => value != null)
    );

    const defaults = {
      debug: false,
      backoffCalculator: SimpleBackoffCalculator(),
      isFailedRequest: function (response) {
        // https://data-star.dev/essays/im_a_teapot/
        return response.status >= 400;
      },
      inactivityTimeoutMs: 0,
      enableConnectionEvents: false,
      enableDatastarSignals: "",
      requestInterceptor: null, // function ({ resource, init }) => ({ resource, init })
      responseInterceptor: null, // function ({ url, response }) => response
      dataInterceptor: null, // function ({ url, response, chunk }) => chunk
    };

    this.element = element;
    this.options = { ...defaults, ...options };
    this.#logger = new Logger(this.options.debug);

    this.#lastStartTime = null;
    this.#retryCount = 0;
    this.#retryTimer = null;
    this.#connected = false;
    this.#lastSSETime = null;
    this.#abortController = null;
    this.#reconnections = -1; // starts at -1, first successful connection sets to 0
    this.#inactivityCheckInterval = null;

    this.init();
  }

  init() {
    ElementIndex.set(this.element, this);
    this.notifyRequestStopped(RETRYER_BYPASS_KEY, true);
  }

  get lastStartTime() {
    return this.#lastStartTime;
  }

  get connected() {
    return this.#connected;
  }

  get reconnections() {
    return this.#reconnections;
  }

  /**
   * Sets the abort controller for the current request.
   * Used by the fetch interceptor to enable request cancellation.
   */
  setAbortController(key, controller) {
    this.#checkKey(key);

    this.#abortController = controller;
  }

  /**
   * Tracks SSE activity by updating the last activity timestamp.
   * The automatic inactivity monitor will handle timeout detection.
   */
  trackSSE(key) {
    this.#checkKey(key);

    if (this.options?.inactivityTimeoutMs > 0) {
      this.#lastSSETime = Date.now();
    }
  }

  /**
   * Starts automatic inactivity monitoring with periodic checks.
   * Called when connection is established to auto-detect inactivity.
   */
  #startInactivityMonitor() {
    if (this.options?.inactivityTimeoutMs <= 0) return;

    this.#stopInactivityMonitor();

    const checkIntervalMs = Math.min(
      1000,
      this.options.inactivityTimeoutMs / 2
    );

    this.#inactivityCheckInterval = setInterval(() => {
      this.#logger.info(
        `[Retryer] Inactivity monitor check, last SSE at: ${this.#lastSSETime}`
      );

      if (this.#lastSSETime === null) return;

      const elapsed = Date.now() - this.#lastSSETime;
      if (elapsed > this.options.inactivityTimeoutMs) {
        this.#logger.warn(
          `[Retryer] Auto-detected inactivity timeout (${this.options.inactivityTimeoutMs}ms), after ${elapsed}ms of no data, aborting connection for element:`,
          this.element
        );

        const controller = this.#abortController;
        this.#abortController = null; // clear before abort to prevent reuse
        controller?.abort("[Retryer] Auto-aborted due to inactivity timeout");

        this.notifyRequestStopped(RETRYER_BYPASS_KEY);
      }
    }, checkIntervalMs);

    this.#logger.info(
      `[Retryer] Started inactivity monitor (checking every ${checkIntervalMs}ms) for element:`,
      this.element
    );
  }

  /**
   * Stops the automatic inactivity monitoring interval.
   */
  #stopInactivityMonitor() {
    if (this.#inactivityCheckInterval) {
      clearInterval(this.#inactivityCheckInterval);
      this.#inactivityCheckInterval = null;
      this.#logger.info(
        "[Retryer] Stopped inactivity monitor for element:",
        this.element
      );
    }
  }

  #checkKey(key) {
    if (key !== RETRYER_BYPASS_KEY) {
      throw new Error(
        "[Retryer] Sensitive method called without RETRYER_BYPASS_KEY"
      );
    }
  }

  /**
   * Notifies the retryer that a fetch request has started.
   * Called by the fetch interceptor when initiating a network request.
   */
  notifyRequestStarted(key) {
    this.#checkKey(key);
    this.#lastSSETime = Date.now();
    this.#lastStartTime = Date.now();
    this.#clearRetryTimer();
    this.#logger.info("[Retryer] request started for element:", this.element);
    this.#startInactivityMonitor(); // Start automatic inactivity monitoring
  }

  /**
   * Determines if a response should be treated as a failed request.
   * Delegates to the user-configured isFailedRequest option.
   */
  isFailedRequest(key, response) {
    this.#checkKey(key);
    return this.options.isFailedRequest(response);
  }

  /**
   * Notifies the retryer that a connection has been successfully established.
   * Resets retry counters, dispatches events, and updates connection state.
   */
  notifyRequestConnected(key) {
    this.#checkKey(key);

    this.#connected = true;
    this.#retryCount = 0;
    this.#reconnections++;
    this.#clearRetryTimer();
    if (this.options.enableConnectionEvents) {
      this.element.dispatchEvent(new Event(CONNECTED_EVENT));
    }
    if (this.options.enableDatastarSignals) {
      SendSignal({
        [this.options.enableDatastarSignals]:
          SIGNALS_CONNECTION_STATES.CONNECTED,
      });
    }
    this.#logger.info("[Retryer] request connected for element:", this.element);
  }

  /**
   * Notifies the retryer that a request has stopped or disconnected.
   * Clears connection state, dispatches events, and optionally schedules reconnection.
   */
  notifyRequestStopped(key, retry = true) {
    this.#checkKey(key);

    // there is no state correlation with this.#connected to this method call,
    // the real connected state is managed externally.
    // (by the interceptor ot even network failures)
    //
    // this.#connected is just a flag to:
    // - provide some protection against CONNECT_EVENT calls.
    // - provide to the user a reference of the last known state (via isConnected())

    this.#abortController = null; // clear to prevent further aborts
    this.#connected = false;
    this.#lastSSETime = null;
    this.#stopInactivityMonitor();

    if (this.options.enableConnectionEvents) {
      this.element.dispatchEvent(new Event(DISCONNECTED_EVENT));
    }
    if (this.options.enableDatastarSignals) {
      SendSignal({
        [this.options.enableDatastarSignals]:
          SIGNALS_CONNECTION_STATES.DISCONNECTED,
      });
    }
    if (this.#reconnections > 0) {
      this.#logger.info("[Retryer] request stopped for element:", this.element);
    }
    if (retry) this.#scheduleReconnect();
  }

  #scheduleReconnect() {
    // ignore if already retrying
    if (this.#retryTimer) {
      this.#logger.info(
        "[Retryer] reconnect already scheduled, skipping for element:",
        this.element
      );
      return;
    }

    // check if element is still in DOM
    if (!document.body.contains(this.element)) {
      this.#logger.warn(
        "[Retryer] element removed from DOM, not scheduling reconnect"
      );
      return;
    }

    this.#retryCount++;

    // schedule reconnect
    const delayMs = this.options.backoffCalculator(
      this.#retryCount,
      this.#lastStartTime,
      this.#reconnections
    );

    if (delayMs === false) {
      this.#logger.error(
        `[Retryer] retries exhausted, not scheduling reconnect for element:`,
        this.element
      );
      this.notifyRequestStopped(RETRYER_BYPASS_KEY, false);
      return;
    }

    this.#logger.warn(
      `[Retryer] scheduling reconnect in ${delayMs}ms (retry #${
        this.#retryCount
      }) for element:`,
      this.element
    );

    this.#retryTimer = setTimeout(() => {
      this.#logger.info(
        `[Retryer] executing scheduled reconnect (retry #${
          this.#retryCount
        }) for element:`,
        this.element
      );
      this.#retryTimer = null;
      this.#fireConnect();
    }, delayMs);
  }

  #fireConnect() {
    if (this.#connected) {
      this.#logger.info(
        "[Retryer] already connected, not firing connect for element:",
        this.element
      );
      return;
    }
    this.element.dispatchEvent(new Event(CONNECT_EVENT));
    if (this.options.enableDatastarSignals) {
      SendSignal({
        [this.options.enableDatastarSignals]:
          SIGNALS_CONNECTION_STATES.CONNECTING,
      });
    }
  }

  // from here down: cleanup

  #clearRetryTimer() {
    if (this.#retryTimer) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
  }

  /**
   * Cleans up the retryer instance and removes it from the element index.
   * Call this when the element is removed or the retryer is no longer needed.
   */
  destroy() {
    this.#clearRetryTimer();
    this.#stopInactivityMonitor();
    ElementIndex.delete(this.element);
    this.#logger.info("[Retryer] Destroyed for element:", this.element);
  }
}

window.Resilient = {
  Retryer: Retryer,
  GetRetryer: function (element) {
    return ElementIndex.get(element);
  },
  SimpleBackoffCalculator: SimpleBackoffCalculator,
};
