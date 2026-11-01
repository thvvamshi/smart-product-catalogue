ALTER TABLE order_inventory_adjustments
  DROP CONSTRAINT IF EXISTS order_inventory_adjustments_adjustment_type_check;

ALTER TABLE order_inventory_adjustments
  ADD CONSTRAINT order_inventory_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('REJECTION_RESTORE', 'CANCELLATION_RESTORE'));
