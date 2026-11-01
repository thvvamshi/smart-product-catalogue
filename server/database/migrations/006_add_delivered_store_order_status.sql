ALTER TABLE store_orders DROP CONSTRAINT IF EXISTS store_orders_status_check;
ALTER TABLE store_orders ADD CONSTRAINT store_orders_status_check CHECK (status IN ('pending_acceptance','accepted','rejected','preparing','ready_for_pickup','delivered','cancelled'));
