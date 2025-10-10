![thinkaboutit](thinkaboutit.png)

I believe it's not the (web) app user's responsibility to take action if something breaks (It could be the connection or something else).
As developers, we should aim to provide resilient solutions that don't rely on the users or third parties.
For me, this is a must for every decent product or service that respects the end user.

> **Note:** This is a new library looking for improvements. It may contain unexpected behaviors. Contributions, opinions or feedback of any kind are more than welcome and greatly appreciated!

## Why "Resilient"?

**"Resilient"** serves a vital function for those using Datastar:

**Essential for:**
- Environments with unstable connections
- Applications running through a proxy or third-party managed infrastructure

**Or even if you just need to:**
- Keep connections active without requiring user intervention
- Provide reliability guarantees

**Improve your web application users' quality of life** by implementing mechanisms that allow you to:
- Apply flexible reconnection policies
- Monitor and manipulate server responses

## Important Considerations

Your server or intermediary servers (proxy, etc.) must consider the necessary resources to handle the persistent requests attempts and keep themselves healthy.
Commercial providers of proxy services and "cloud workers" (like cloudflare) already implement rate limiting and other protections.

By default, with no custom **dataInterceptor** (see Configuration Options below), there is negligible performance overhead with low to medium volumes of Server-Sent Events (SSE). If your web application has high SSE throughput and custom data modification, there could be significant performance overhead.

## Technical Overview

**Resilient** works by intercepting `window.fetch` and coordinating with Datastar's action system to provide automatic reconnection for SSE connections, while also allowing you to transform and monitor SSE events and responses through a customizable stream transformation system.

### Architecture

The library is modular and organized into separate concerns:

1. **Datastar Integration** (`datastar.js`) - Datastar plugin, signal system for reactive connection state updates, and stream transformation utilities
2. **Fetch Interceptor** (`interceptor.js`) - Overrides `window.fetch` to track request lifecycle, apply stream transformations, and coordinate with Retryer instances
3. **Retryer** (`retryer.js`) - Manages reconnection logic with configurable backoff, tracks connection state, and provides request/response/data interceptor configuration
4. **Shared Utilities** (`shared.js`) - Common utilities, data structures, and constants used across modules
5. **Entry Point** (`index.js`) - Public API exports

### Key Components

- **Element-to-Retryer Mapping**: Uses WeakMap (`ElementIndex`) to associate DOM elements with their Retryer instances.
- **Fetch ID Mapping**: Uses temporary Map (`fetchIdToElement`) to associate fetch requests with their originating elements.
- **AbortController Chain**: Properly handles cancellation through layered abort signals, supporting both user-initiated and retryer-initiated aborts
- **Signal System**: Optional Datastar signal integration for reactive connection state updates (via `enableDatastarSignals` option)
- **Inactivity Detection**: Optional heartbeat monitoring that reconnects if no SSE chunks are received within a configurable timeout
- **Backoff Strategy**: Flexible retry logic via `backoffCalculator` that can distinguish between initial connection attempts and reconnections, with ability to stop retrying by returning `false`

## Example Usage

### Basic Setup

**Note:** The examples below use `"./dist/resilient.min.js"` as the import path. Adjust the path based on your file structure.

```html
<script type="module">
  // IMPORTANT: Resilient must be imported first, to ensure the fetch interceptor
  // is set up before Datastar initializes
  import { LoadDatastarPlugin } from "./dist/resilient.min.js";
  import { load } from "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.5/bundles/datastar.js";

  LoadDatastarPlugin(load);
</script>

<!-- Create Retryer inline using data-on-load with 'el' reference -->
<!-- Note: Using Datastar signals for connection state (enableDatastarSignals option) -->
<div data-signals="{isConnected: false}"
     data-on-load="new Resilient.Retryer(el, {debug:true, enableDatastarSignals: 'isConnected'})"
     data-on-connect="@get('/api/feed')">

  <!-- Connection status indicator -->
  <div data-show="$isConnected !== 'connected'"
       style="padding: 10px; background: #fef3c7; border: 1px solid #f59e0b;">
    <span data-text="$isConnected === 'connecting' ? 'Connecting...' : 'Reconnecting to server...'"></span>
  </div>

  <!-- Your content here -->
</div>
```

### Using with Script Tags

Alternatively, you can create the Retryer in a script block and use traditional events:

```html
<div id="my-feed"
     data-on-connect="@get('/api/feed')">
  <!-- SSE content -->
</div>

<script>
  const element = document.getElementById('my-feed');
  const retryer = new window.Resilient.Retryer(element, {
    debug: true,
    enableConnectionEvents: true,  // Enable event dispatching
    backoffCalculator: (retryCount, lastStartTime, reconnections) => {
      return Math.min(30000, 1000 * Math.pow(2, retryCount));
    },
    inactivityTimeoutMs: 30000
  });

  // Listen to events
  element.addEventListener('connected', () => {
    console.log('Connected to feed');
  });
</script>
```

### Configuration Options

```javascript
new window.Resilient.Retryer(element, {
  // Enable console logging (default: false)
  debug: true,

  // Custom backoff strategy
  // Default: exponential backoff with 2 multiplier, capped at 30s
  // For initial connection (reconnections === 0): max 3 attempts with 20ms delay
  // Return false to stop retrying entirely
  backoffCalculator: (retryCount, lastStartTime, reconnections) => {
    // retryCount: consecutive retry attempts (starts at 0)
    // lastStartTime: timestamp when the last request started
    // reconnections: number of successful connections (0 = initial connection)

    // Example: limit initial connection to 5 attempts
    if (reconnections === 0 && retryCount > 5) {
      return false;  // Stop retrying
    }
    return Math.min(10000, 1000 * Math.pow(2, retryCount));
  },

  // Define failed requests (default: status >= 400, per Datastar convention)
  // See: https://data-star.dev/essays/im_a_teapot/
  isFailedRequest: (response) => {
    return response.status >= 500;  // Only retry on server errors
  },

  // Inactivity timeout in ms (default: 0 = disabled)
  // Reconnects if no SSE chunks have been received within this time
  inactivityTimeoutMs: 30000,

  // Enable connection lifecycle events (default: false)
  // When true, dispatches 'connected' and 'disconnected' events
  // Note: 'connect' event is always dispatched regardless of this setting
  enableConnectionEvents: true,

  // Enable Datastar signals for connection state (default: "" = disabled)
  // Provide a signal key name to receive state updates
  // Values: "connecting", "connected", "disconnected"
  enableDatastarSignals: "connectionState",

  // Request interceptor (default: null)
  // Modify fetch requests before they execute
  // Takes ({ resource, init }) and returns { resource, init }
  requestInterceptor: ({ resource, init }) => {
    // resource can be string, URL, or Request object
    // init is the optional RequestInit
    console.log('Request:', resource);
    return { resource, init };
  },

  // Response interceptor (default: null)
  // Modify Response object before it's returned to Datastar
  // Takes ({ url, response }) and returns modified Response
  responseInterceptor: ({ url, response }) => {
    console.log('Response from:', url, response.status);
    return response;
  },

  // Data interceptor (default: null)
  // Modify streaming response data chunks
  // Takes ({ url, response, chunk }) and returns modified chunk
  // Chunk is a Uint8Array containing binary data
  dataInterceptor: ({ url, response, chunk }) => {
    // Example: log chunk size
    console.log('Chunk size:', chunk.length);
    return chunk;  // Return the chunk (optionally modified)
  }
});
```

### Stream Transformation

```javascript
// Intercept and log all SSE chunks using dataInterceptor option

const element = document.getElementById('my-feed');
const decoder = new TextDecoder();

const retryer = new window.Resilient.Retryer(element, {
  dataInterceptor: ({ url, response, chunk }) => {
    const text = decoder.decode(chunk, { stream: true });
    console.log(`[${url}] Received:`, text);

    // You have access to:
    // - url: The fetch URL
    // - response: The Response object
    // - chunk: The current Uint8Array chunk

    // Return the modified chunk (or original)
    return chunk;
  }
});
```

### Event Handling

**Important:** The `connected` and `disconnected` events are opt-in. You must enable them with `enableConnectionEvents: true`. The `connect` event is always dispatched.

```javascript
const element = document.getElementById('my-feed');

// Listen for connection attempts (always dispatched)
element.addEventListener('connect', () => {
  console.log('Attempting to connect...');
});

// Create retryer with connected/disconnected events enabled
const retryer = new window.Resilient.Retryer(element, {
  enableConnectionEvents: true  // Required for 'connected' and 'disconnected' events
});

// Listen for connection established (requires enableConnectionEvents: true)
element.addEventListener('connected', () => {
  console.log('Connected to server');
  // Update UI, hide loading indicators, etc.
});

// Listen for disconnection (requires enableConnectionEvents: true)
element.addEventListener('disconnected', () => {
  console.log('Disconnected from server');
  // Show reconnecting indicator, etc.
});

// Check connection status
if (retryer.connected) {
  console.log('Connected!');
}
```

**Alternative: Using Datastar Signals**

If you prefer Datastar's reactive signals over events:

```html
<div data-signals="{connectionState: 'disconnected'}"
     data-on-load="new Resilient.Retryer(el, {enableDatastarSignals: 'connectionState'})"
     data-on-connect="@get('/api/feed')">

  <!-- Signal automatically updates with: "connecting", "connected", "disconnected" -->
  <div data-show="$connectionState !== 'connected'">
    Connecting...
  </div>
</div>
```

### Cleanup

```javascript
// Destroy retryer when element is removed
const retryer = window.Resilient.GetRetryer(element);
retryer?.destroy();
```

## API Reference

### Window API

**`window.Resilient.Retryer`**
- Constructor class for creating Retryer instances
- See Configuration Options section above

**`window.Resilient.GetRetryer(element)`**
- Retrieves the Retryer instance associated with a DOM element
- Returns `Retryer | undefined`

**`window.Resilient.SimpleBackoffCalculator`**
- Factory function for creating configurable backoff calculators
- See Module Exports section above for detailed documentation and examples

### Module Exports

The following are available as named imports from `dist/resilient.min.js`:

**`LoadDatastarPlugin(load)`**
- Function to load the Datastar plugin
- Must be called before Datastar initializes

**`ToggleInterceptorLogging(enabled)`**
- Function to enable/disable fetch interceptor logging
- Pass `true` to enable, `false` to disable

**`CONNECT_EVENT`**
- Constant: `"connect"` - event name dispatched when reconnection is initiated
- Always dispatched regardless of `enableConnectionEvents` setting

**`CONNECTED_EVENT`**
- Constant: `"connected"` - event name dispatched when connection is established
- Requires `enableConnectionEvents: true` in Retryer options

**`DISCONNECTED_EVENT`**
- Constant: `"disconnected"` - event name dispatched when connection is lost
- Requires `enableConnectionEvents: true` in Retryer options

**`SIGNALS_CONNECTION_STATES`**
- Object containing connection state values for Datastar signals
- Values: `{ CONNECTING: "connecting", CONNECTED: "connected", DISCONNECTED: "disconnected" }`
- Used with `enableDatastarSignals` option

**`ContentType`**
- Utility class for parsing Content-Type headers
- Example:
  ```javascript
  import { ContentType } from "./dist/resilient.min.js";

  const ct = new ContentType("text/html; charset=utf-8");
  console.log(ct.type);        // "text"
  console.log(ct.subtype);     // "html"
  console.log(ct.charset);     // "utf-8"
  console.log(ct.isHTML);      // true
  console.log(ct.isSSE);       // false
  ```

**`SimpleBackoffCalculator`**
- Factory function that creates configurable exponential backoff calculator
- Returns a backoff calculator function compatible with Retryer's `backoffCalculator` option
- Configuration options:
  - `maxInitialAttempts` (default: 3) - Maximum number of quick retries for initial connection
  - `initialDelayMs` (default: 20) - Initial retry delay in milliseconds
  - `maxDelayMs` (default: 30000) - Maximum delay cap in milliseconds
  - `baseDelayMs` (default: 1000) - Base delay multiplier in milliseconds
  - `baseMultiplier` (default: 2) - Base for exponential calculation
- Example:
  ```javascript
  import { SimpleBackoffCalculator } from "./dist/resilient.min.js";

  const customBackoff = SimpleBackoffCalculator({
    maxInitialAttempts: 5,
    initialDelayMs: 50,
    maxDelayMs: 60000,
    baseDelayMs: 2000,
    baseMultiplier: 2
  });

  const retryer = new window.Resilient.Retryer(element, {
    backoffCalculator: customBackoff
  });
  ```

## Implementation Details

### Initial Connection Logic

When a Retryer is created, it immediately attempts to establish an initial connection:

1. On initialization, calls `notifyRequestStopped()` which triggers reconnection logic
2. Dispatches a `connect` event to trigger the Datastar action (e.g., `data-on-connect`)
3. The default `backoffCalculator` handles initial connection attempts specially:
   - When `reconnections === 0` (first connection), uses a short 20ms delay
   - Limits initial attempts to 3 by default (configurable via custom backoffCalculator)
   - Returns `false` to stop retrying if max attempts exceeded
4. Once connected, `reconnections` counter increments and normal backoff applies

**Stopping Initial Connection Attempts:**

The backoffCalculator can return `false` to stop all retry attempts:

```javascript
new window.Resilient.Retryer(element, {
  backoffCalculator: (retryCount, lastStartTime, reconnections) => {
    // Stop after 5 initial connection attempts
    if (reconnections === 0 && retryCount > 5) {
      return false;  // Stops retrying entirely
    }
    return Math.min(30000, 1000 * Math.pow(2, retryCount));
  }
});
```

### Reconnection Logic

After an established connection is lost:

1. `notifyRequestStopped()` is called by the interceptor
2. Retryer schedules a reconnect using `backoffCalculator`
3. For reconnections (`reconnections > 0`), backoffCalculator typically uses exponential backoff
4. After delay, dispatches `connect` event to retry
5. Retry count increments on each consecutive failure
6. Retry count resets to 0 once connection is re-established

### Inactivity Detection

When `inactivityTimeoutMs` is configured:

1. Each SSE chunk updates `lastSSETime` timestamp
2. On each new chunk, checks if time since last chunk exceeds timeout
3. If timeout exceeded, aborts the request and schedules reconnect
4. Uses the same reconnection logic as normal failures

### AbortController Chain

The library properly handles abort signals:

1. Creates a new AbortController for each request
2. If the original request had a signal, forwards abort events to new controller
3. Retryer can abort via its own controller (for failures or inactivity)
4. Prevents double-abort by clearing controller reference after use

### Datastar Integration

**Important:** The Datastar plugin makes the following automatic modifications:

1. **Disables Datastar's Retry**: Sets `retryMaxCount: 0` on all Datastar actions to disable Datastar's built-in retry mechanism. This ensures Resilient has complete control over reconnection logic, preventing conflicts between two retry systems.

2. **Injects Fetch IDs**: Adds `X-Fetch-Id` headers to all fetch requests from elements with Retryer instances, enabling the fetch interceptor to associate requests with their originating elements.

3. **Suppresses Errors**: Catches and suppresses Datastar's "FetchFailed" errors since Resilient handles reconnection automatically.

This happens automatically when the plugin is loaded - you don't need to configure anything. All Datastar actions (`$get`, `$post`, etc.) from elements with Retryers will be managed by Resilient.

## Best Practices

### Server-Side Considerations

1. **Rate Limiting**: Implement rate limiting to prevent abuse from aggressive retry policies
2. **Timeout Configuration**: Set appropriate server timeouts that align with `inactivityTimeoutMs`
3. **Resource Management**: Monitor SSE connection counts and implement connection limits per client
4. **Health Checks**: Use the inactivity timeout feature to detect and close stale connections

### Client-Side Recommendations

1. **Backoff Strategy**: Use exponential backoff with a reasonable cap (5-30 seconds) to avoid overwhelming the server. Optionally return `false` from backoffCalculator to stop retrying if needed.
2. **Connection State UI**: Choose between events (`enableConnectionEvents`) or Datastar signals (`enableDatastarSignals`) based on your needs. Signals integrate seamlessly with Datastar's reactivity, while events provide more control for non-Datastar code.
3. **Debug Mode**: Enable debug mode during development to understand connection behavior. Use `ToggleInterceptorLogging(true)` for detailed fetch interceptor logs.
4. **Cleanup**: Always call `retryer.destroy()` when removing elements from the DOM to prevent memory leaks.
5. **Data Interceptor**: Keep dataInterceptor logic lightweight to minimize performance impact on high-throughput SSE streams.

### Common Patterns

**Auto-reconnecting feed with connection state UI:**
```javascript
const retryer = new window.Resilient.Retryer(element, {
  enableDatastarSignals: 'feedStatus',  // Use Datastar signals for UI
  backoffCalculator: (retryCount, lastStartTime, reconnections) => {
    // Stop initial connection after 3 attempts
    if (reconnections === 0 && retryCount > 3) {
      return false;
    }
    // Exponential backoff for reconnections, capped at 30s
    return Math.min(30000, 1000 * Math.pow(2, retryCount));
  },
  inactivityTimeoutMs: 60000  // 1 minute timeout
});
```

```html
<!-- In your HTML -->
<div data-signals="{feedStatus: 'disconnected'}"
     data-on-load="/* create retryer with enableDatastarSignals: 'feedStatus' */">

  <div data-show="$feedStatus === 'connecting'">
    Connecting to feed...
  </div>

  <div data-show="$feedStatus === 'disconnected'">
    Unable to connect. Please refresh the page.
  </div>

  <div data-show="$feedStatus === 'connected'">
    <!-- Your feed content -->
  </div>
</div>
```

**Using traditional events for fine-grained control:**
```javascript
const retryer = new window.Resilient.Retryer(element, {
  debug: true,
  enableConnectionEvents: true  // Enable events
});

element.addEventListener('connected', () => {
  console.log('Feed connected');
  // Update external UI, analytics, etc.
});

element.addEventListener('disconnected', () => {
  console.log('Feed disconnected');
});
```

**Development debugging:**
```javascript
import { ToggleInterceptorLogging } from "./dist/resilient.min.js";

// Enable all logging in development
ToggleInterceptorLogging(true);

const retryer = new window.Resilient.Retryer(element, {
  debug: true
});
```

## Running the Test Server

### Quick Start

From the resilient directory:

```bash
./start-test-server.sh
```

The script will:
- ✅ Start the Go test server on http://localhost:8080
- ✅ Serve source files directly from `/src` (no bundling required!)
- ✅ Changes to source files take effect immediately - just refresh your browser!


See [test/README.md](test/README.md) for detailed test scenarios and documentation.
