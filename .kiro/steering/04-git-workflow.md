# Steering 04 — Git and Version Control

- Simplified trunk-based: protected `main` branch + `feature/<spec-name>` branches (e.g. `feature/02-backend-telemetry-core`).
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.
- Atomic commits: each commit represents a single logical change (one task, one fix, one feature piece).
  This provides full traceability — anyone reading the branch history understands what was done in what order.
- One Pull Request per completed spec. Minimum PR checklist:
  - [ ] Unit tests pass
  - [ ] Lint without warnings
  - [ ] Database migrations included if applicable
  - [ ] `docs/` updated if the spec introduced a contract change (MQTT, DB, endpoints)
- Although development is individual, the team workflow is simulated (PRs, checklist) as a demonstrable
  professional practice in the interview.
