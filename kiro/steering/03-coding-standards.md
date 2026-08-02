# Steering 03 — Coding Standards

- ESLint + Prettier mandatory, zero warnings before merging.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes/DTOs, `kebab-case` for file names.
- Error handling in NestJS: typed exceptions (`HttpException` and subclasses), never plain string `throw`.
- Every public function in a Service has a brief JSDoc: what it does, not how (the how should be readable from the code).
- Python (simulator): mandatory type hints on function signatures, `black` as formatter.
- No code file exceeds ~300 lines without justification; if a class grows too large, split by
  responsibility (e.g.: separate the motor state machine from the MQTT publishing logic).
