# Migration Guide: Datastar v1.0.0-RC.5 → v1.0.0-RC.6

This document describes the changes made to make the Resilient library compatible with Datastar v1.0.0-RC.6.

**Note:** This library aims to be compatible with the latest version of Datastar. The current version supports **v1.0.0-RC.6 only**. Support for v1.0.0-RC.5 has been removed. This document is provided for historical reference and to help users understand the migration path from older versions.

## Changes Summary

### 1. Plugin Architecture Changes

**Old Datastar (v1.0.0-RC.5):**
- Used a `load` function that accepted plugin objects with `type` and `onGlobalInit`
- Plugins had access to `ctx.actions` object to wrap action functions
- Plugin structure: `{ type: "watcher", name: "...", onGlobalInit: (ctx) => {...} }`

**New Datastar (v1.0.0-RC.6):**
- Uses `action()`, `attribute()`, and `watcher()` functions to register plugins
- Actions are registered via `action({ name, apply })` v1.0.0-RC.6
- No more `ctx.actions` object - must import `actions` proxy to access originals
- Plugins wrap existing actions by re-registering them with the same name

### 2. Updated LoadDatastarPlugin Function

The `LoadDatastarPlugin` function now requires the new Datastar API:

**New Usage (v1.0.0-RC.6):**
```javascript
import { LoadDatastarPlugin } from 'resilient.js';
import { action, actions } from 'datastar';

LoadDatastarPlugin({ action, actions });
```

**Note:** Backwards compatibility with v1.0.0-RC.5 has been removed. You must upgrade to Datastar v1.0.0-RC.6.

### 3. Implementation Changes

#### Old Implementation (RC.5)
```javascript
const DatastarPlugin = {
  type: "watcher",
  name: "element-fetch-mapper",
  onGlobalInit: (ctx) => {
    for (const actionName in ctx.actions) {
      const original = ctx.actions[actionName].fn;
      ctx.actions[actionName].fn = (actionCtx, url, args = {}) => {
        // wrapper code
      };
    }
  },
};
```

#### New Implementation (v1.0.0-RC.6)
```javascript
function wrapFetchAction(originalAction) {
  return async (ctx, url, args = {}) => {
    // wrapper code
  };
}

// In LoadDatastarPlugin:
const fetchActions = ["get", "post"];
for (const actionName of fetchActions) {
  const originalAction = actions[actionName];
  action({
    name: actionName,
    apply: wrapFetchAction(originalAction),
  });
}
```

### 4. Event Name Constants

Added explicit constants:
```javascript
const DATASTAR_FETCH_EVENT = "datastar-fetch";
const DATASTAR_SIGNAL_PATCH_EVENT = "datastar-signal-patch";
```

### 5. Error Handling (No Change)

Both RC.5 and RC.6 use the same error handling:

```javascript
if (error?.message?.startsWith("FetchFailed")) {
  // suppress and let Retryer handle reconnection
}
```

In both versions, when retries are exhausted, the error gets wrapped in a `FetchFailed` error by Datastar's `error()` function, so the check remains the same.

## Breaking Changes

### For End Users

**Breaking Change:** The library no longer supports Datastar v1.0.0-RC.5. You must upgrade to v1.0.0-RC.6.

**Required Changes:**

```diff
- import { load } from 'datastar';
- LoadDatastarPlugin(load);
+ import { action, actions } from 'datastar';
+ LoadDatastarPlugin({ action, actions });
```

### For Library Maintainers

If you're maintaining a fork or extending this library:

1. The plugin no longer has access to `ctx.actions` in an `onGlobalInit` callback
2. Must import `action` and `actions` from Datastar to wrap actions
3. Action wrapping is done by re-registering actions with the same name
4. The `actions` proxy provides read access to registered action functions

## Testing

Existing tests need to be updated to use Datastar v1.0.0-RC.6 with the new API.

## Compatibility Matrix

| Resilient Version | Datastar v1.0.0-RC.5 | Datastar v1.0.0-RC.6 |
|-------------------|----------------------|----------------------|
| 0.1.X (old)       | ✅                   | ❌                   |
| 0.2.X (new)       | ❌                   | ✅                   |

## Notes

- The plugin still relies on undocumented Datastar API and or internals (wrapping action plugins)
- Future Datastar versions may break compatibility
- The maintainer will make efforts to keep the library updated with new Datastar releases
- Community contributions for compatibility updates are welcome
