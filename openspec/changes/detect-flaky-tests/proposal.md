## Why

Intermittent test failures need to be detected and traced before they are forgotten.

## What Changes

- Run the unit suite twice in a dedicated reliability workflow.
- Preserve available test reports and fail the check when either run fails.

## Capabilities

### New Capabilities
- `test-reliability`: compare individual test outcomes across runs.

### Modified Capabilities
None.

## Impact

The test tooling and workflow change; scene behavior and dependencies do not.
