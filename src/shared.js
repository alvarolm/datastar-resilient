/**
 * A symbol key to access retryer sensitive methods.
 *
 * @warning If this key is used outside this library, it is at the user's own risk.
 * @constant {symbol}
 */
export const RETRYER_BYPASS_KEY = Symbol("unsafe");

/**
 * WeakMap that associates HTML elements with their Retryer instances.
 * Uses WeakMap to allow garbage collection when elements are removed from DOM.
 *
 * @type {WeakMap<HTMLElement, Retryer>}
 */
export const ElementIndex = new WeakMap();

/**
 * Map that tracks fetch IDs to their associated elements.
 * Used by the Datastar plugin to correlate fetch requests with their originating elements.
 *
 * @type {Map<string, HTMLElement>}
 */
export const FetchIdToElement = new Map();

/**
 * Event name fired when a reconnect attempt is initiated.
 * Dispatched before attempting to establish a connection.
 *
 * @constant {string}
 */
export const CONNECT_EVENT = "connect";

/**
 * Event name fired when a connection is successfully established.
 * Indicates the SSE stream is ready and receiving data.
 *
 * @constant {string}
 */
export const CONNECTED_EVENT = "connected";

/**
 * Event name fired when a connection is lost or disconnected.
 * Triggers automatic reconnection logic via the Retryer.
 *
 * @constant {string}
 */
export const DISCONNECTED_EVENT = "disconnected";

export class Logger {
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
}

/**
 * Parser and utility class for HTTP Content-Type headers.
 * Parses media types and parameters from Content-Type header strings.
 *
 * @example
 * const ct = new ContentType("text/html; charset=utf-8");
 * ct.isHTML // true
 * ct.charset // "utf-8"
 */
export class ContentType {
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
    // Split by semicolon to separate media type from parameters
    const parts = this.raw.split(";").map((p) => p.trim());
    const mediaType = parts[0].toLowerCase();

    // Parse parameters (e.g., charset=utf-8, boundary=...)
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
    return (
      this._parsed.mediaType === "application/json" ||
      this._parsed.mediaType.endsWith("+json")
    );
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
    return (
      this._parsed.mediaType === "application/xml" ||
      this._parsed.mediaType === "text/xml" ||
      this._parsed.mediaType.endsWith("+xml")
    );
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
    // Support wildcards like "text/*" or "*/json"
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
}
