# Resilient Library Test Server

This is a comprehensive test server for the Resilient library using Go and datastar-go.

## Overview

The test server provides multiple SSE endpoints that simulate various real-world scenarios to test the resilience and reconnection capabilities of the Resilient library with Datastar.

## Quick Start

### Prerequisites

- Go 1.25.0 or later
- Modern web browser with JavaScript module support

### Running the Server

**Recommended** - From the parent directory:
```bash
cd ..
./start-test-server.sh
```

**Alternative** - From this directory:
```bash
go run main.go
```

The server will start on `http://localhost:8080`

Open your browser to `http://localhost:8080` to see the test.

### How It Works

The test server serves source files directly from `../src/` - no bundling required! This means:
- ✅ Changes to source files take effect immediately
- ✅ Just refresh your browser to see updates
- ✅ No build step for JavaScript changes
- ✅ Easy debugging with unminified source files

## Test Scenarios

### 1. Stable Connection
- **Endpoint**: `/api/stable`
- **Behavior**: Reliable SSE stream that never fails
- **Purpose**: Baseline test to verify normal operation
- **Updates**: Every 500ms

### 2. Random Failures
- **Endpoint**: `/api/random-failures`
- **Behavior**: 50% chance to fail on connection, disconnects after 4 events
- **Purpose**: Tests automatic reconnection with exponential backoff
- **Updates**: Every 250ms when connected

### 3. Delayed Start
- **Endpoint**: `/api/delayed-start`
- **Behavior**: 3 second delay before connection establishes
- **Purpose**: Tests initial connection patience and timeout handling
- **Updates**: Every 250ms after connection

### 4. Inactivity Detection
- **Endpoint**: `/api/inactivity-test`
- **Behavior**: Sends 3 events then stops sending data (connection stays open)
- **Purpose**: Tests inactivity timeout detection (configured at 8 seconds)
- **Configuration**: Uses `inactivityTimeoutMs: 8000` in Retryer options
- **Expected**: Should reconnect after 8 seconds of no data

## Features Demonstrated

### Resilient Library Features

1. **Automatic Reconnection**
   - Exponential backoff with configurable strategies
   - Graceful handling of connection failures
   - Retry count management

2. **Inactivity Detection**
   - Configurable timeout for detecting stale connections
   - Automatic reconnection when no data received

3. **Connection State Management**
   - Real-time status indicators (connecting/connected/disconnected)
   - Integration with Datastar signals
   - Custom event dispatching

4. **Error Handling**
   - Server error (5xx) detection
   - Network failure recovery
   - Mid-stream disconnection handling

### Datastar-go Integration

1. **Server-Sent Events (SSE)**
   - Proper SSE stream handling with `datastar-go`
   - Signal merging for reactive updates
   - Fragment templating

2. **Signal Updates**
   - Real-time counter updates
   - Log message streaming
   - Status tracking

3. **Context Handling**
   - Proper cleanup on client disconnect
   - Graceful shutdown
   - Resource management

## Development

### Project Structure

```
test/
├── main.go          # Test server with all SSE endpoints
├── go.mod           # Go module dependencies
└── README.md        # This file

Note: Source files are served directly from ../src/
```

### Modifying Test Scenarios

To add a new test scenario:

1. Create a new handler function in `main.go`:
```go
func myTestSSE(w http.ResponseWriter, r *http.Request) {
    sse := sse.NewSSE(w, r)
    // Your implementation
}
```

2. Register the route in `main()`:
```go
mux.HandleFunc("/api/my-test", myTestSSE)
```

3. Add a test card in the HTML (in `serveIndex` function):
```html
<div class="test-card"
     data-signals="{status: 'connecting', count: 0, logs: []}"
     data-init="new Resilient.Retryer(el, {
         debug: true,
         enableConnectionDatastarSignals: 'status'
     })"
     data-on:connect="$get('/api/my-test')">
    <h2>My Test</h2>
    <!-- Your test UI -->
</div>
```

### Modifying Source Files

The server serves source files directly from `../src/`. When you modify any source file:

1. Save your changes
2. Refresh your browser (Ctrl+R or Cmd+R)
3. Changes take effect immediately - no rebuild needed!

## Troubleshooting

### Enable Debug Logging

All test scenarios have `debug: true` enabled in their Retryer configuration. Check the browser console to see detailed logs:

- Connection attempts
- Reconnection backoff timing
- SSE chunk reception
- Error details

### Common Issues

1. **Connection not reconnecting**
   - Check browser console for errors
   - Verify server is running
   - Ensure no browser extensions are blocking SSE

2. **Inactivity timeout not triggering**
   - Verify `inactivityTimeoutMs` is set in Retryer options
   - Check that the timeout is longer than the interval between events

3. **Events not updating**
   - Verify Datastar signals are properly named
   - Check that the element has the correct `data-signals` attribute
   - Ensure the Retryer is properly initialized

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Requires ES6 module support

## Performance Notes

- Each test card creates its own SSE connection
- Server includes proper context cancellation for cleanup
- Minimal overhead due to simple signal updates
- Suitable for testing but not production load testing

## Further Reading

- [Resilient Library Documentation](../README.md)
- [Datastar Documentation](https://data-star.dev/)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

## License

Same as parent project.
