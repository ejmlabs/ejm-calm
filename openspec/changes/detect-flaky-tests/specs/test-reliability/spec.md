## ADDED Requirements

### Requirement: Detect inconsistent test outcomes

The test reliability check SHALL compare test identities across two runs and fail when either run fails or the evidence is incomplete.

#### Scenario: A test fails and then passes

- **WHEN** a test fails in one run and passes in the other
- **THEN** the check names the inconsistent test and fails

#### Scenario: A report cannot be compared

- **WHEN** a report is missing or contains ambiguous test identities
- **THEN** the check fails without claiming a test passed
