-- +goose Up
-- List prices per plan, set by Signet staff in the admin app and shown on the pricing and checkout pages.
-- Amounts are US cents per seat per month; annual_cents is the monthly equivalent when billed yearly.
-- NULL prices mean "contact sales".
CREATE TABLE plan_prices (
    plan text PRIMARY KEY CHECK (plan IN ('starter', 'business', 'premium', 'enterprise')),
    monthly_cents integer CHECK (monthly_cents BETWEEN 0 AND 10000000),
    annual_cents integer CHECK (annual_cents BETWEEN 0 AND 10000000),
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((monthly_cents IS NULL) = (annual_cents IS NULL)),
    CHECK (annual_cents IS NULL OR annual_cents <= monthly_cents)
);
INSERT INTO plan_prices (plan, monthly_cents, annual_cents) VALUES
    ('starter', 1200, 900),
    ('business', 2400, 1800),
    ('premium', 4000, 3000),
    ('enterprise', NULL, NULL);

-- What a paid workspace pays per seat per month (the monthly equivalent on annual billing). It's fixed when
-- staff set the plan, so later list-price changes leave existing subscriptions alone. NULL means no price
-- has been agreed yet, e.g. an Enterprise contract still being negotiated.
ALTER TABLE organization_subscriptions ADD COLUMN seat_price_cents integer CHECK (seat_price_cents BETWEEN 0 AND 10000000);
UPDATE organization_subscriptions s
SET seat_price_cents = CASE WHEN s.billing_cycle = 'annual' THEN p.annual_cents ELSE p.monthly_cents END
FROM plan_prices p
WHERE p.plan = s.plan;

ALTER TABLE admin_audit_events DROP CONSTRAINT admin_audit_events_target_type_check;
ALTER TABLE admin_audit_events ADD CONSTRAINT admin_audit_events_target_type_check
    CHECK (target_type IN ('workspace', 'user', 'envelope', 'job', 'admin', 'flag', 'webhook', 'announcement', 'deletion', 'plan'));

-- +goose Down
ALTER TABLE admin_audit_events DROP CONSTRAINT admin_audit_events_target_type_check;
ALTER TABLE admin_audit_events ADD CONSTRAINT admin_audit_events_target_type_check
    CHECK (target_type IN ('workspace', 'user', 'envelope', 'job', 'admin', 'flag', 'webhook', 'announcement', 'deletion'));
ALTER TABLE organization_subscriptions DROP COLUMN IF EXISTS seat_price_cents;
DROP TABLE IF EXISTS plan_prices;
