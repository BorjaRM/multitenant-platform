# AI system index

## Instructions

- [Repository conventions](copilot-instructions.md)
- [Database and tenant isolation](instructions/database.instructions.md)
- [Integration tests](instructions/integration-tests.instructions.md)
- [Migrations](instructions/migrations.instructions.md)
- [Specifications and traceability](instructions/specifications.instructions.md)

## Agents

- [Tenancy spike](agents/tenancy-spike.agent.md)
- [Code review](agents/code-review.agent.md)

## Spike execution skill

- [Skill](skills/execute-tenancy-spike/SKILL.md)
- [Checkpoint responsibilities](skills/execute-tenancy-spike/references/execution-checkpoints.md)
- [Testing strategy](skills/execute-tenancy-spike/references/testing-strategy.md)
- [Evidence format](skills/execute-tenancy-spike/references/evidence-format.md)
- [Execution script](skills/execute-tenancy-spike/scripts/run-spike-tests.sh): PostgreSQL, typecheck, documentation, integration and mutation checks.
- [Traceability validator](skills/execute-tenancy-spike/scripts/verify-traceability.ts): exact requirement set, real paths, owner checkpoints, matching states and explicit closure blockers. Run using `npm run test:traceability`.
- [Results template](skills/execute-tenancy-spike/templates/spike-results.md)
- [Traceability template](skills/execute-tenancy-spike/templates/traceability.md)

## Automation

- [CI validation](workflows/spike-validation.yml)
- [Pull request template](pull_request_template.md)
