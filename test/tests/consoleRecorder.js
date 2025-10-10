/**
 * Console Recorder - Intercepts all console methods and writes them to a downloadable file
 *
 * Usage:
 *   const recorder = new ConsoleRecorder();
 *   recorder.start();
 *
 *   // Your code that generates console output
 *   console.log('Hello');
 *   console.warn('Warning');
 *
 *   // Download the logs
 *   recorder.downloadLogs('console-logs.txt');
 *
 *   // Stop recording and restore original console
 *   recorder.stop();
 */
class ConsoleRecorder {
  constructor() {
    this.logs = [];
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      info: console.info,
      error: console.error,
      debug: console.debug,
      trace: console.trace,
    };
    this.isRecording = false;
    this.includeTimestamps = true;
    this.includeStackTrace = false;
  }

  /**
   * Start intercepting console methods
   */
  start() {
    if (this.isRecording) {
      return;
    }

    this.isRecording = true;
    const self = this;

    // Intercept console.log
    console.log = function (...args) {
      self._record("LOG", args);
      self.originalConsole.log.apply(console, args);
    };

    // Intercept console.warn
    console.warn = function (...args) {
      self._record("WARN", args);
      self.originalConsole.warn.apply(console, args);
    };

    // Intercept console.info
    console.info = function (...args) {
      self._record("INFO", args);
      self.originalConsole.info.apply(console, args);
    };

    // Intercept console.error
    console.error = function (...args) {
      self._record("ERROR", args);
      self.originalConsole.error.apply(console, args);
    };

    // Intercept console.debug
    console.debug = function (...args) {
      self._record("DEBUG", args);
      self.originalConsole.debug.apply(console, args);
    };

    // Intercept console.trace
    console.trace = function (...args) {
      self._record("TRACE", args, true);
      self.originalConsole.trace.apply(console, args);
    };
  }

  /**
   * Stop intercepting and restore original console methods
   */
  stop() {
    if (!this.isRecording) {
      return;
    }

    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    console.trace = this.originalConsole.trace;

    this.isRecording = false;
  }

  /**
   * Internal method to record console output
   */
  _record(level, args, includeTrace = false) {
    const timestamp = this.includeTimestamps ? new Date().toISOString() : null;
    const message = args.map((arg) => this._formatArg(arg)).join(" ");

    let stackTrace = null;
    if (this.includeStackTrace || includeTrace) {
      const stack = new Error().stack;
      // Remove the first 3 lines (Error, _record, and the console method)
      stackTrace = stack.split("\n").slice(3).join("\n");
    }

    const logEntry = {
      timestamp,
      level,
      message,
      stackTrace,
      rawArgs: args,
    };

    this.logs.push(logEntry);
  }

  /**
   * Format arguments for logging
   */
  _formatArg(arg) {
    if (arg === null) return "null";
    if (arg === undefined) return "undefined";
    if (typeof arg === "string") return arg;
    if (typeof arg === "number" || typeof arg === "boolean") return String(arg);

    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}\n${arg.stack}`;
    }

    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }

    return String(arg);
  }

  /**
   * Convert logs to formatted text
   */
  toText() {
    return this.logs
      .map((entry) => {
        let line = "";

        if (entry.timestamp) {
          line += `[${entry.timestamp}] `;
        }

        line += `[${entry.level}] ${entry.message}`;

        if (entry.stackTrace) {
          line += `\n${entry.stackTrace}`;
        }

        return line;
      })
      .join("\n");
  }

  /**
   * Convert logs to JSON format
   */
  toJSON() {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Download logs as a file
   */
  downloadLogs(filename = "console-logs.txt", format = "text") {
    const content = format === "json" ? this.toJSON() : this.toText();
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the URL object
    URL.revokeObjectURL(url);
  }

  /**
   * Save logs using File System Access API (if available)
   * This provides a native file picker dialog
   */
  async saveLogs(filename = "console-logs.txt", format = "text") {
    if (!("showSaveFilePicker" in window)) {
      // Fallback to download if File System Access API is not available
      this.downloadLogs(filename, format);
      return;
    }

    try {
      const content = format === "json" ? this.toJSON() : this.toText();

      const options = {
        suggestedName: filename,
        types: [
          {
            description: "Text Files",
            accept: { "text/plain": [".txt"] },
          },
        ],
      };

      if (format === "json") {
        options.types[0].description = "JSON Files";
        options.types[0].accept = { "application/json": [".json"] };
      }

      const handle = await window.showSaveFilePicker(options);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Error saving file:", err);
        // Fallback to download
        this.downloadLogs(filename, format);
      }
    }
  }

  /**
   * Clear all recorded logs
   */
  clear() {
    this.logs = [];
  }

  /**
   * Get all logs
   */
  getLogs() {
    return this.logs;
  }

  /**
   * Set whether to include timestamps
   */
  setIncludeTimestamps(include) {
    this.includeTimestamps = include;
  }

  /**
   * Set whether to include stack traces
   */
  setIncludeStackTrace(include) {
    this.includeStackTrace = include;
  }
}

// Auto-start recording if window.autoRecordConsole is true
if (typeof window !== "undefined" && window.autoRecordConsole) {
  window.consoleRecorder = new ConsoleRecorder();
  window.consoleRecorder.start();

  // Provide a global function to download logs
  window.downloadConsoleLogs = function (filename, format) {
    window.consoleRecorder.downloadLogs(filename, format);
  };

  // Provide a global function to save logs with file picker
  window.saveConsoleLogs = function (filename, format) {
    return window.consoleRecorder.saveLogs(filename, format);
  };
}

// Export for module systems
if (typeof module !== "undefined" && module.exports) {
  module.exports = ConsoleRecorder;
}

const recorder = new ConsoleRecorder();
let filename = "test_results.txt";

export function Start(logFilename) {
  if (logFilename) {
    filename = logFilename;
  }
  recorder.start();
}

function updateTestStatus(status, message) {
  const testStatus = document.querySelector(".test-status");
  testStatus.classList.remove(
    "status-processing",
    "status-ok",
    "status-failed"
  );
  testStatus.classList.add(`status-${status}`);
  testStatus.querySelector("span").textContent = message;
}

export function Finish({ pass }) {
  if (pass) {
    console.log("[TEST PASSED]");
    updateTestStatus("ok", "OK");
  } else {
    console.error("[TEST FAILED]");
    updateTestStatus("failed", "Failed");
  }
  recorder.downloadLogs(filename);
  recorder.stop();
}
