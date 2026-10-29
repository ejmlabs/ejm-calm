## Context

Vitest produces JSON reports with file names, test names and outcomes.

## Decisions

Compare two complete reports from consecutive runs. Missing, duplicate or changed test identities are incomplete evidence. Keep each test run's failure status and both reports.

## Risks

Two runs cannot prove reliability and add time to the check.
