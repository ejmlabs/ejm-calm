## Context

Vitest produces JSON reports with file names, test names and outcomes.

## Decisions

Compare identifiable tests from consecutive runs, even when evidence is incomplete. Missing, duplicate or changed test identities are incomplete evidence. Keep each test run's failure status and available reports.

Collect the test inventory separately so that cases missing from both reports, including skipped cases, fail the check. Leave time after the comparison deadline to upload available evidence.

## Risks

Two runs cannot prove reliability and add time to the check.
