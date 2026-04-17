-- Add evaluate_review to the job_type enum.
-- Required by the review completion flow (S2-T15 / T15 completeReview action).
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'evaluate_review';
