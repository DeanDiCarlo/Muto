-- =============================================================================
-- Muto — Seed Data
-- seed.sql
--
-- Default rate limits for all institutions (institution_id = NULL means global).
-- These are the baseline limits enforced across all Muto tenants.
--
-- Student-facing limits use 'block' — hard reject when exceeded.
-- Generation limits use 'alert' — notify but allow the job to proceed.
-- =============================================================================

INSERT INTO rate_limits (usage_type, limit_type, limit_value, action_on_limit, is_active)
VALUES
  -- Chatbot: 50 messages per user per hour (hard block)
  ('chatbot', 'per_user_hourly', 50, 'block', true),

  -- Chatbot: 300 messages per user per day (hard block)
  ('chatbot', 'per_user_daily', 300, 'block', true),

  -- Knowledge Review evaluation: 100 evaluations per user per hour (hard block)
  ('review_evaluation', 'per_user_hourly', 100, 'block', true),

  -- Lab generation: 20 labs per institution per day (alert only — pilot phase)
  ('lab_generation', 'per_institution_daily', 20, 'alert', true),

  -- Lab generation: $50/day per institution (alert only)
  ('lab_generation', 'cost_daily_cents', 5000, 'alert', true),

  -- Lab generation: $500/month per institution (alert only)
  ('lab_generation', 'cost_monthly_cents', 50000, 'alert', true);
