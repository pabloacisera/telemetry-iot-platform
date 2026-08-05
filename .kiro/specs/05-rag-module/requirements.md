# Spec 05 — RAG Module

## Scope (decided after iteration): the RAG answers about the NOW, not about deep history
Deep history is Grafana's responsibility. The RAG combines: (1) live snapshot of the queried motor,
(2) brief recent summary (alerts/status changes from the last few hours), (3) vectorized knowledge base in
Mongo (maintenance documents written from the researched standards).

## Requirements (EARS)
- WHEN a user queries about a specific motor, THE SYSTEM SHALL obtain its live snapshot from Redis
  (last value and status of each sensor) before building any response.
- IF the `motor_sensor` has no recent reading in Redis (sensor `fault: disconnected`), THEN THE SYSTEM SHALL
  explicitly respond that there is no recent data for that sensor, without inventing a value.
- IF a sensor is in `fault`/`fault_persistent`/`stuck`, THEN THE SYSTEM SHALL indicate that the data from
  that sensor is unreliable and NOT use it as a verified fact in the response.
- WHEN building context, THE SYSTEM SHALL include a brief (not exhaustive) summary of recent alerts and
  status changes for the queried motor, obtained from `alerts`/`motor_status_history`.
- WHEN explanations of causes or recommendations are needed, THE SYSTEM SHALL search by cosine similarity in
  the `embeddings` collection in Mongo and use the top-K most relevant fragments as additional context.
- IF the user asks for deep historical information (beyond recent), THEN THE SYSTEM SHALL respond with an
  explicit redirection to Grafana, without attempting to reconstruct that history.
- IF there is no relevant context in the knowledge base (similarity below threshold), THEN THE SYSTEM SHALL
  indicate insufficient information, without hallucinating a cause.

## Acceptance criteria
- No RAG response asserts a numerical value from a sensor that is in `fault` state.
- The cosine similarity service has a unit test with known vectors.
