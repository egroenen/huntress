# T010: Transmission Guard and Suppressions

Status: Done

## Goal

Monitor Transmission, detect loop-prone or failed torrents, remove them when appropriate, and create time-based suppressions to prevent wasteful re-search loops.

## Scope

- Poll Transmission torrent state.
- Persist current torrent observations.
- Detect candidate problem states:
  - explicit Transmission error
  - stalled/no-progress torrents
  - repeated known-bad release fingerprints
- Remove torrents from Transmission according to policy.
- Create `release_suppression` records with configurable expiry.
- Prefer authoritative Arr queue/download linkage over fuzzy title matching when possible.
- Surface removal reasons and suppression reasons clearly.

## Out of Scope

- Deep torrent-to-Arr correlation beyond what MVP can reliably infer
- Automatic manual-release management in Sonarr/Radarr

## Dependencies

- `T005-external-client-foundations.md`
- `T006-arr-state-sync.md`
- `T009-search-dispatch-and-run-history.md`

## Implementation Notes

- Default to `deleteLocalData=true`.
- Suppression should be time-based by default and configurable.
- Be conservative about removal decisions to avoid false positives.

## Acceptance Criteria

- Error or stalled torrents can be identified and recorded.
- Configured removals are executed against Transmission.
- Suppression records are created and honored by later search cycles.
- The system can prevent obvious re-grab loops for the same release fingerprint.

## Test Notes

- Mocked Transmission RPC tests for 409 negotiation, error states, and stalled-state detection.
- Decision tests for suppression expiry behavior.
