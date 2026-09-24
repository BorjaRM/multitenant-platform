# Evidence format

## Required sections

- Requirement ID
- Test name
- Command executed
- Result status
- Relevant output excerpt
- Risk or follow-up note

## Example

```md
## TEN-REQ-006

- Test: rls-configuration.integration.spec.ts
- Command: npm run test -- rls-configuration
- Result: PASS
- Evidence: PostgreSQL policy validation passed
- Notes: None
```
