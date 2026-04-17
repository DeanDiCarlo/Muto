-- Enforce one response per question per session, enabling safe upsert
ALTER TABLE review_responses
  ADD CONSTRAINT review_responses_session_question_unique
  UNIQUE (review_session_id, review_question_id);
