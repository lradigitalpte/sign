-- +goose Up
-- Workspaces that pay online have a Stripe customer and subscription. Stripe's webhooks keep the plan,
-- seats, status and renewal date here in step with Stripe; staff can't edit those by hand while a
-- Stripe subscription exists.
ALTER TABLE organization_subscriptions
    ADD COLUMN stripe_customer_id text,
    ADD COLUMN stripe_subscription_id text,
    -- The customer canceled; the plan keeps working until period_ends_at, then drops to Free.
    ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX organization_subscriptions_stripe_subscription_idx ON organization_subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX organization_subscriptions_stripe_customer_idx ON organization_subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- One Stripe product per paid plan, created on first checkout. Prices are sent with each checkout from
-- plan_prices, so changing a price in the admin app needs no change in Stripe.
ALTER TABLE plan_prices ADD COLUMN stripe_product_id text;

-- Every Stripe webhook event received, so retries are processed once and failures can be looked into.
CREATE TABLE stripe_events (
    id text PRIMARY KEY,
    type text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    error text
);
CREATE INDEX stripe_events_received_idx ON stripe_events (received_at DESC);

-- +goose Down
DROP TABLE IF EXISTS stripe_events;
ALTER TABLE plan_prices DROP COLUMN IF EXISTS stripe_product_id;
DROP INDEX IF EXISTS organization_subscriptions_stripe_customer_idx;
DROP INDEX IF EXISTS organization_subscriptions_stripe_subscription_idx;
ALTER TABLE organization_subscriptions
    DROP COLUMN IF EXISTS cancel_at_period_end,
    DROP COLUMN IF EXISTS stripe_subscription_id,
    DROP COLUMN IF EXISTS stripe_customer_id;
