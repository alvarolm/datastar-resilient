var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});

// src/shared.js
var RETRYER_BYPASS_KEY = Symbol("unsafe");
var ElementIndex = /* @__PURE__ */ new WeakMap();
var FetchIdToElement = /* @__PURE__ */ new Map();
var CONNECT_EVENT = "connect";
var CONNECTED_EVENT = "connected";
var DISCONNECTED_EVENT = "disconnected";
var Logger = class {
  constructor(enabled = false) {
    this.enabled = enabled;
  }
  info(...args) {
    if (this.enabled) console.info(...args);
  }
  warn(...args) {
    if (this.enabled) console.warn(...args);
  }
  error(...args) {
    console.error(...args);
  }
};
var ContentType = class {
  /**
   * Creates a new ContentType parser instance.
   *
   * @param {string} contentTypeString - The Content-Type header value to parse
   */
  constructor(contentTypeString) {
    this.raw = contentTypeString || "";
    this._parsed = this._parse();
  }
  /**
   * Internal parser that extracts media type and parameters.
   *
   * @private
   * @returns {{mediaType: string, params: Object}} Parsed media type and parameters
   */
  _parse() {
    const parts = this.raw.split(";").map((p) => p.trim());
    const mediaType = parts[0].toLowerCase();
    const params = {};
    for (let i = 1; i < parts.length; i++) {
      const [key, value] = parts[i].split("=").map((s) => s.trim());
      if (key && value) {
        params[key.toLowerCase()] = value.replace(/^["']|["']$/g, "");
      }
    }
    return { mediaType, params };
  }
  /**
   * Gets the main type (e.g., "text" from "text/html").
   *
   * @returns {string} The main type
   */
  get type() {
    return this._parsed.mediaType.split("/")[0];
  }
  /**
   * Gets the subtype (e.g., "html" from "text/html").
   *
   * @returns {string} The subtype
   */
  get subtype() {
    return this._parsed.mediaType.split("/")[1];
  }
  /**
   * Gets all parsed parameters as an object.
   *
   * @returns {Object} Parameters object (e.g., {charset: "utf-8"})
   */
  get params() {
    return this._parsed.params;
  }
  /**
   * Checks if the content type is Server-Sent Events (text/event-stream).
   *
   * @returns {boolean} True if SSE
   */
  get isSSE() {
    return this._parsed.mediaType === "text/event-stream";
  }
  /**
   * Checks if the content type is JSON or a JSON variant (+json).
   *
   * @returns {boolean} True if JSON
   */
  get isJSON() {
    return this._parsed.mediaType === "application/json" || this._parsed.mediaType.endsWith("+json");
  }
  /**
   * Checks if the content type is HTML.
   *
   * @returns {boolean} True if HTML
   */
  get isHTML() {
    return this._parsed.mediaType === "text/html";
  }
  /**
   * Checks if the content type is XML or an XML variant (+xml).
   *
   * @returns {boolean} True if XML
   */
  get isXML() {
    return this._parsed.mediaType === "application/xml" || this._parsed.mediaType === "text/xml" || this._parsed.mediaType.endsWith("+xml");
  }
  /**
   * Checks if the main type is "text".
   *
   * @returns {boolean} True if text type
   */
  get isText() {
    return this.type === "text";
  }
  /**
   * Checks if the main type is "multipart".
   *
   * @returns {boolean} True if multipart type
   */
  get isMultipart() {
    return this.type === "multipart";
  }
  /**
   * Checks if the content type is multipart/form-data.
   *
   * @returns {boolean} True if form data
   */
  get isFormData() {
    return this._parsed.mediaType === "multipart/form-data";
  }
  /**
   * Checks if the content type is application/x-www-form-urlencoded.
   *
   * @returns {boolean} True if URL encoded form
   */
  get isFormURLEncoded() {
    return this._parsed.mediaType === "application/x-www-form-urlencoded";
  }
  /**
   * Checks if the content type is binary (not text, JSON, XML, or HTML).
   *
   * @returns {boolean} True if binary
   */
  get isBinary() {
    return !this.isText && !this.isJSON && !this.isXML && !this.isHTML;
  }
  /**
   * Gets the charset parameter, defaults to "utf-8" if not specified.
   *
   * @returns {string} The charset value
   */
  get charset() {
    return this.params.charset || "utf-8";
  }
  /**
   * Checks if the media type exactly matches the given type.
   *
   * @param {string} type - The media type to compare (case-insensitive)
   * @returns {boolean} True if exact match
   */
  is(type) {
    return this._parsed.mediaType === type.toLowerCase();
  }
  /**
   * Checks if the media type matches a pattern.
   * Supports RegExp or wildcard strings like "text/*" or "* /json".
   *
   * @param {string|RegExp} pattern - Pattern to match against
   * @returns {boolean} True if matches pattern
   */
  matches(pattern) {
    if (pattern instanceof RegExp) {
      return pattern.test(this._parsed.mediaType);
    }
    const regex = new RegExp("^" + pattern.replace("*", ".*") + "$");
    return regex.test(this._parsed.mediaType);
  }
  /**
   * Returns the original Content-Type header string.
   *
   * @returns {string} The raw Content-Type header value
   */
  toString() {
    return this.raw;
  }
};

// src/datastar.js
var DATASTAR_FETCH_EVENT = "datastar-fetch";
function FetchReturn(response, transformStream) {
  const transformedBody = response.body.pipeThrough(transformStream);
  return new Response(transformedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });
}
var FetchIdHeader = "X-Fetch-Id";
function SendSignal(signal) {
  const detail = {
    type: "datastar-patch-signals",
    argsRaw: {
      signals: JSON.stringify(signal)
    }
  };
  document.dispatchEvent(new CustomEvent(DATASTAR_FETCH_EVENT, { detail }));
}
var SIGNALS_CONNECTION_STATES = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected"
};
var fetchCounter = 0;
function wrapFetchAction(originalAction) {
  return async (ctx, url, args = {}) => {
    const hasRetryer = !!ElementIndex.get(ctx.el);
    if (!hasRetryer) {
      return originalAction(ctx, url, args);
    }
    const fetchId = `${++fetchCounter}`;
    FetchIdToElement.set(fetchId, ctx.el);
    setTimeout(() => FetchIdToElement.delete(fetchId), 5e3);
    args.headers = { ...args.headers, [FetchIdHeader]: fetchId };
    args.retryMaxCount = 0;
    try {
      return await originalAction(ctx, url, args);
    } catch (error) {
      if (error?.message?.startsWith("FetchFailed")) {
        InterceptorLogger.info(
          `[Interceptor] Suppressed Datastar FetchFailed error, Retryer will handle reconnection for:`,
          ctx.el
        );
        return;
      }
      throw error;
    }
  };
}
function LoadDatastarPlugin(datastarExports) {
  try {
    const { action, actions } = datastarExports;
    if (!action || !actions) {
      throw new Error(
        "LoadDatastarPlugin requires { action, actions } from Datastar v1.0.0-RC.6. Import them from your Datastar bundle and pass them to LoadDatastarPlugin."
      );
    }
    const fetchActions = ["get", "post"];
    for (const actionName of fetchActions) {
      const originalAction = actions[actionName];
      if (!originalAction) {
        throw new Error(
          `[Resilient] Action '${actionName}' not found in Datastar. Cannot wrap missing action.`
        );
      }
      action({
        name: actionName,
        apply: wrapFetchAction(originalAction)
      });
      InterceptorLogger.info(`[Resilient] Wrapped Datastar action: ${actionName}`);
    }
    InterceptorLogger.info("[Resilient] Successfully loaded Datastar plugin");
  } catch (e) {
    console.error("[Resilient] Failed to load DatastarPlugin:", e);
    throw e;
  }
}

// src/retryer.js
function SimpleBackoffCalculator({
  maxInitialAttempts = 3,
  initialDelayMs = 20,
  maxDelayMs = 3e4,
  baseDelayMs = 1e3,
  baseMultiplier = 2
} = {}) {
  let initialRetryCount = 0;
  return function(retryCount, _, reconnections) {
    if (reconnections === -1) {
      initialRetryCount++;
      if (maxInitialAttempts > 0 && initialRetryCount > maxInitialAttempts) {
        return false;
      }
      return initialDelayMs;
    }
    return Math.min(
      maxDelayMs,
      baseDelayMs * Math.pow(baseMultiplier, retryCount)
    );
  };
}
var _logger, _lastStartTime, _retryCount, _retryTimer, _connected, _lastSSETime, _abortController, _reconnections, _inactivityCheckInterval, _Retryer_instances, startInactivityMonitor_fn, stopInactivityMonitor_fn, checkKey_fn, scheduleReconnect_fn, fireConnect_fn, clearRetryTimer_fn;
var Retryer = class {
  constructor(element, options = {}) {
    __privateAdd(this, _Retryer_instances);
    __privateAdd(this, _logger);
    __privateAdd(this, _lastStartTime);
    __privateAdd(this, _retryCount);
    __privateAdd(this, _retryTimer);
    __privateAdd(this, _connected);
    __privateAdd(this, _lastSSETime);
    __privateAdd(this, _abortController);
    __privateAdd(this, _reconnections);
    __privateAdd(this, _inactivityCheckInterval);
    options = Object.fromEntries(
      Object.entries(options).filter(([_, value]) => value != null)
    );
    const defaults = {
      debug: false,
      backoffCalculator: SimpleBackoffCalculator(),
      isFailedRequest: function(response) {
        return response.status >= 400;
      },
      inactivityTimeoutMs: 0,
      enableConnectionEvents: false,
      enableDatastarSignals: "",
      requestInterceptor: null,
      // function ({ resource, init }) => ({ resource, init })
      responseInterceptor: null,
      // function ({ url, response }) => response
      dataInterceptor: null
      // function ({ url, response, chunk }) => chunk
    };
    this.element = element;
    this.options = { ...defaults, ...options };
    __privateSet(this, _logger, new Logger(this.options.debug));
    __privateSet(this, _lastStartTime, null);
    __privateSet(this, _retryCount, 0);
    __privateSet(this, _retryTimer, null);
    __privateSet(this, _connected, false);
    __privateSet(this, _lastSSETime, null);
    __privateSet(this, _abortController, null);
    __privateSet(this, _reconnections, -1);
    __privateSet(this, _inactivityCheckInterval, null);
    this.init();
  }
  init() {
    ElementIndex.set(this.element, this);
    this.notifyRequestStopped(RETRYER_BYPASS_KEY, true);
  }
  get lastStartTime() {
    return __privateGet(this, _lastStartTime);
  }
  get connected() {
    return __privateGet(this, _connected);
  }
  get reconnections() {
    return __privateGet(this, _reconnections);
  }
  /**
   * Sets the abort controller for the current request.
   * Used by the fetch interceptor to enable request cancellation.
   */
  setAbortController(key, controller) {
    __privateMethod(this, _Retryer_instances, checkKey_fn).call(this, key);
    __privateSet(this, _abortController, controller);
  }
  /**
   * Tracks SSE activity by updating the last activity timestamp.
   * The automatic inactivity monitor will handle timeout detection.
   */
  trackSSE(key) {
    __privateMethod(this, _Retryer_instances, checkKey_fn).call(this, key);
    if (this.options?.inactivityTimeoutMs > 0) {
      __privateSet(this, _lastSSETime, Date.now());
    }
  }
  /**
   * Notifies the retryer that a fetch request has started.
   * Called by the fetch interceptor when initiating a network request.
   */
  notifyRequestStarted(key) {
    __privateMethod(this, _Retryer_instances, checkKey_fn).call(this, key);
    __privateSet(this, _lastSSETime, Date.now());
    __privateSet(this, _lastStartTime, Date.now());
    __privateMethod(this, _Retryer_instances, clearRetryTimer_fn).call(this);
    __privateGet(this, _logger).info("[Retryer] request started for element:", this.element);
    __privateMethod(this, _Retryer_instances, startInactivityMonitor_fn).call(this);
  }
  /**
   * Determines if a response should be treated as a failed request.
   * Delegates to the user-configured isFailedRequest option.
   */
  isFailedRequest(key, response) {
    __privateMethod(this, _Retryer_instances, checkKey_fn).call(this, key);
    return this.options.isFailedRequest(response);
  }
  /**
   * Notifies the retryer that a connection has been successfully established.
   * Resets retry counters, dispatches events, and updates connection state.
   */
  notifyRequestConnected(key) {
    __privateMethod(this, _Retryer_instances, checkKey_fn).call(this, key);
    __privateSet(this, _connected, true);
    __privateSet(this, _retryCount, 0);
    __privateWrapper(this, _reconnections)._++;
    __privateMethod(this, _Retryer_instances, clearRetryTimer_fn).call(this);
    if (this.options.enableConnectionEvents) {
      this.element.dispatchEvent(new Event(CONNECTED_EVENT));
    }
    if (this.options.enableDatastarSignals) {
      SendSignal({
        [this.options.enableDatastarSignals]: SIGNALS_CONNECTION_STATES.CONNECTED
      });
    }
    __privateGet(this, _logger).info("[Retryer] request connected for element:", this.element);
  }
  /**
   * Notifies the retryer that a request has stopped or disconnected.
   * Clears connection state, dispatches events, and optionally schedules reconnection.
   */
  notifyRequestStopped(key, retry = true) {
    __privateMethod(this, _Retryer_instances, checkKey_fn).call(this, key);
    __privateSet(this, _abortController, null);
    __privateSet(this, _connected, false);
    __privateSet(this, _lastSSETime, null);
    __privateMethod(this, _Retryer_instances, stopInactivityMonitor_fn).call(this);
    if (this.options.enableConnectionEvents) {
      this.element.dispatchEvent(new Event(DISCONNECTED_EVENT));
    }
    if (this.options.enableDatastarSignals) {
      SendSignal({
        [this.options.enableDatastarSignals]: SIGNALS_CONNECTION_STATES.DISCONNECTED
      });
    }
    if (__privateGet(this, _reconnections) > 0) {
      __privateGet(this, _logger).info("[Retryer] request stopped for element:", this.element);
    }
    if (retry) __privateMethod(this, _Retryer_instances, scheduleReconnect_fn).call(this);
  }
  /**
   * Cleans up the retryer instance and removes it from the element index.
   * Call this when the element is removed or the retryer is no longer needed.
   */
  destroy() {
    __privateMethod(this, _Retryer_instances, clearRetryTimer_fn).call(this);
    __privateMethod(this, _Retryer_instances, stopInactivityMonitor_fn).call(this);
    ElementIndex.delete(this.element);
    __privateGet(this, _logger).info("[Retryer] Destroyed for element:", this.element);
  }
};
_logger = new WeakMap();
_lastStartTime = new WeakMap();
_retryCount = new WeakMap();
_retryTimer = new WeakMap();
_connected = new WeakMap();
_lastSSETime = new WeakMap();
_abortController = new WeakMap();
_reconnections = new WeakMap();
_inactivityCheckInterval = new WeakMap();
_Retryer_instances = new WeakSet();
/**
 * Starts automatic inactivity monitoring with periodic checks.
 * Called when connection is established to auto-detect inactivity.
 */
startInactivityMonitor_fn = function() {
  if (this.options?.inactivityTimeoutMs <= 0) return;
  __privateMethod(this, _Retryer_instances, stopInactivityMonitor_fn).call(this);
  const checkIntervalMs = Math.min(
    1e3,
    this.options.inactivityTimeoutMs / 2
  );
  __privateSet(this, _inactivityCheckInterval, setInterval(() => {
    __privateGet(this, _logger).info(
      `[Retryer] Inactivity monitor check, last SSE at: ${__privateGet(this, _lastSSETime)}`
    );
    if (__privateGet(this, _lastSSETime) === null) return;
    const elapsed = Date.now() - __privateGet(this, _lastSSETime);
    if (elapsed > this.options.inactivityTimeoutMs) {
      __privateGet(this, _logger).warn(
        `[Retryer] Auto-detected inactivity timeout (${this.options.inactivityTimeoutMs}ms), after ${elapsed}ms of no data, aborting connection for element:`,
        this.element
      );
      const controller = __privateGet(this, _abortController);
      __privateSet(this, _abortController, null);
      controller?.abort("[Retryer] Auto-aborted due to inactivity timeout");
      this.notifyRequestStopped(RETRYER_BYPASS_KEY);
    }
  }, checkIntervalMs));
  __privateGet(this, _logger).info(
    `[Retryer] Started inactivity monitor (checking every ${checkIntervalMs}ms) for element:`,
    this.element
  );
};
/**
 * Stops the automatic inactivity monitoring interval.
 */
stopInactivityMonitor_fn = function() {
  if (__privateGet(this, _inactivityCheckInterval)) {
    clearInterval(__privateGet(this, _inactivityCheckInterval));
    __privateSet(this, _inactivityCheckInterval, null);
    __privateGet(this, _logger).info(
      "[Retryer] Stopped inactivity monitor for element:",
      this.element
    );
  }
};
checkKey_fn = function(key) {
  if (key !== RETRYER_BYPASS_KEY) {
    throw new Error(
      "[Retryer] Sensitive method called without RETRYER_BYPASS_KEY"
    );
  }
};
scheduleReconnect_fn = function() {
  if (__privateGet(this, _retryTimer)) {
    __privateGet(this, _logger).info(
      "[Retryer] reconnect already scheduled, skipping for element:",
      this.element
    );
    return;
  }
  if (!document.body.contains(this.element)) {
    __privateGet(this, _logger).warn(
      "[Retryer] element removed from DOM, not scheduling reconnect"
    );
    return;
  }
  __privateWrapper(this, _retryCount)._++;
  const delayMs = this.options.backoffCalculator(
    __privateGet(this, _retryCount),
    __privateGet(this, _lastStartTime),
    __privateGet(this, _reconnections)
  );
  if (delayMs === false) {
    __privateGet(this, _logger).error(
      `[Retryer] retries exhausted, not scheduling reconnect for element:`,
      this.element
    );
    this.notifyRequestStopped(RETRYER_BYPASS_KEY, false);
    return;
  }
  __privateGet(this, _logger).warn(
    `[Retryer] scheduling reconnect in ${delayMs}ms (retry #${__privateGet(this, _retryCount)}) for element:`,
    this.element
  );
  __privateSet(this, _retryTimer, setTimeout(() => {
    __privateGet(this, _logger).info(
      `[Retryer] executing scheduled reconnect (retry #${__privateGet(this, _retryCount)}) for element:`,
      this.element
    );
    __privateSet(this, _retryTimer, null);
    __privateMethod(this, _Retryer_instances, fireConnect_fn).call(this);
  }, delayMs));
};
fireConnect_fn = function() {
  if (__privateGet(this, _connected)) {
    __privateGet(this, _logger).info(
      "[Retryer] already connected, not firing connect for element:",
      this.element
    );
    return;
  }
  this.element.dispatchEvent(new Event(CONNECT_EVENT));
  if (this.options.enableDatastarSignals) {
    SendSignal({
      [this.options.enableDatastarSignals]: SIGNALS_CONNECTION_STATES.CONNECTING
    });
  }
};
// from here down: cleanup
clearRetryTimer_fn = function() {
  if (__privateGet(this, _retryTimer)) {
    clearTimeout(__privateGet(this, _retryTimer));
    __privateSet(this, _retryTimer, null);
  }
};
window.Resilient = {
  Retryer,
  GetRetryer: function(element) {
    return ElementIndex.get(element);
  },
  SimpleBackoffCalculator
};

// src/interceptor.js
var FetchIdHeader2 = "X-Fetch-Id";
var InterceptorLogger = new Logger(false);
function ToggleInterceptorLogging(enabled) {
  InterceptorLogger.enabled = enabled;
}
var fetchStreamTransformer = function({ url, response, retryer }) {
  return new TransformStream({
    async transform(chunk, controller) {
      retryer?.trackSSE(RETRYER_BYPASS_KEY);
      try {
        if (retryer?.options.dataInterceptor) {
          chunk = retryer.options.dataInterceptor({ url, response, chunk }) ?? chunk;
        }
        controller.enqueue(chunk);
      } catch (e) {
        InterceptorLogger.error(
          "[Interceptor] Error in stream transformer:",
          e
        );
        controller.error(e);
      }
    }
  });
};
var originalFetch = window.fetch;
window.fetch = async function(resource, init) {
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
      init
    }));
  }
  const isRequestObject = resource instanceof Request;
  const url = isRequestObject ? resource.url : resource;
  const abortController = new AbortController();
  if (init?.signal) {
    init.signal.aborted ? abortController.abort(init.signal.reason) : init.signal.addEventListener(
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
    if (isRequestObject) {
      response = await originalFetch(resource, newOptions);
    } else {
      response = await originalFetch(url, newOptions);
    }
    if (retryer.isFailedRequest(RETRYER_BYPASS_KEY, response)) {
      abortController.abort(
        "[Interceptor] Fetch aborted by retryer: unexpected response"
      );
      InterceptorLogger.warn(
        `[Interceptor] Fetch aborted by retryer: unexpected response for ${url}`,
        response
      );
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
    response = retryer.options.responseInterceptor({ url, response }) ?? response;
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
    retryer
  });
  return FetchReturn(response, transformStream);
};
function getRetryer(resource, init) {
  const isRequestObject = resource instanceof Request;
  let fetchId = null;
  let headersToClean = null;
  if (init?.headers) {
    fetchId = init.headers instanceof Headers ? init.headers.get(FetchIdHeader2) : init.headers?.[FetchIdHeader2];
    if (fetchId) {
      headersToClean = init.headers;
    }
  }
  if (!fetchId && isRequestObject) {
    fetchId = resource.headers.get(FetchIdHeader2);
    if (fetchId) {
      headersToClean = null;
    }
  }
  if (!fetchId) {
    return { retryer: null };
  }
  if (headersToClean) {
    if (headersToClean instanceof Headers) {
      headersToClean.delete(FetchIdHeader2);
    } else if (typeof headersToClean === "object") {
      delete headersToClean[FetchIdHeader2];
    }
  }
  const element = FetchIdToElement.get(fetchId);
  FetchIdToElement.delete(fetchId);
  if (!element) {
    InterceptorLogger.error(
      "[Interceptor] No element found for fetchId:",
      fetchId
    );
    return { retryer: null };
  }
  if (!document.contains(element)) {
    InterceptorLogger.error(
      "[Interceptor] Element for fetchId is no longer in DOM:",
      fetchId,
      element
    );
    return { retryer: null };
  }
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
export {
  CONNECTED_EVENT,
  CONNECT_EVENT,
  ContentType,
  DISCONNECTED_EVENT,
  LoadDatastarPlugin,
  SIGNALS_CONNECTION_STATES,
  SimpleBackoffCalculator,
  ToggleInterceptorLogging
};
//# sourceMappingURL=resilient.js.map
