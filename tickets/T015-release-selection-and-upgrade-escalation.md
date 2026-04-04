# T015: Release Selection and Upgrade Escalation

Status: Backlog

## Goal

Add an optional acquisition-policy layer that can participate in release choice, including intentionally accepting a lower-grade release now and placing the item into an aggressive upgrade path immediately afterward.

## Scope

- Define fallback acquisition policies such as:
  - `best_only`
  - `good_enough_now`
  - `fallback_then_upgrade`
- Support a configurable minimum acceptable fallback floor per app:
  - codec/container
  - quality tier
  - language
  - custom format constraints
- Evaluate available release candidates before final acceptance.
- Prefer higher-value releases when available, but allow controlled lower-grade grabs when policy permits.
- Mark fallback grabs as `upgrade_priority` so they re-enter the upgrade lane quickly.
- Persist release-choice reasoning and the fact that a fallback was chosen intentionally.
- Avoid looping on the same bad or low-value release repeatedly.

## Out of Scope

- Replacing Arr quality profiles
- Full custom indexer querying outside Arr unless required later
- Advanced machine-learning style scoring

## Dependencies

- `T009-search-dispatch-and-run-history.md`
- `T010-transmission-guard-and-suppressions.md`

## Implementation Notes

- This should be an explicit second policy layer, not hidden inside the basic search decision engine.
- The orchestrator must remain explainable:
  - why a fallback release was accepted
  - why it was considered acceptable
  - why it was marked for urgent upgrade
- Preferred first implementation path:
  - inspect Arr-accessible release candidates if possible
  - score them against deterministic policy rules
  - record the selected release fingerprint and rationale
- If release-level participation requires deeper Arr integration than expected, keep the policy disabled by default and ship it behind a feature flag.

## Acceptance Criteria

- The system can deliberately choose a fallback release when no preferred release is available.
- Fallback acceptance is recorded with an explicit reason and policy label.
- Fallback items enter an upgrade-priority queue with a shorter retry cadence.
- The same low-value release is not repeatedly reselected after failure.

## Test Notes

- Policy tests covering preferred release available vs fallback-only scenarios.
- Tests for upgrade-priority escalation after fallback acceptance.
- Regression tests ensuring fallback mode is disabled unless explicitly configured.
