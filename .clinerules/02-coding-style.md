# Coding Style

- Use TypeScript everywhere.
- Prefer explicit types for public interfaces, DTOs and connector contracts.
- Keep business logic out of controllers.
- Keep provider-specific logic inside connector packages/modules.
- Do not duplicate mapping logic between frontend and backend.
- Use shared DTOs/types from packages/shared where appropriate.
- Use validation schemas for inputs and configuration.
- Keep functions small and testable.
- Use clear error types for domain errors and provider errors.
- Use idempotency keys for publication operations.