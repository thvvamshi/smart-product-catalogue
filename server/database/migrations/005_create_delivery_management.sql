CREATE TABLE IF NOT EXISTS delivery_agents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_code VARCHAR(64) NOT NULL UNIQUE,
  identity_key VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(20) NOT NULL CHECK (phone ~ '^[0-9+ -]{8,20}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  availability VARCHAR(16) NOT NULL DEFAULT 'available' CHECK (availability IN ('available','unavailable','on_delivery')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delivery_agents_status_idx
  ON delivery_agents(status, availability, id);

CREATE TABLE IF NOT EXISTS delivery_dispatchers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_key VARCHAR(128) NOT NULL UNIQUE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('admin','dispatcher')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_number VARCHAR(48) NOT NULL UNIQUE,
  store_order_id BIGINT NOT NULL UNIQUE REFERENCES store_orders(id) ON DELETE RESTRICT,
  customer_order_id BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_assignment' CHECK (status IN ('pending_assignment','assigned','heading_to_store','arrived_at_store','picked_up','out_for_delivery','delivered','delivery_failed','cancelled')),
  pickup_snapshot JSONB NOT NULL CHECK (jsonb_typeof(pickup_snapshot) = 'object'),
  customer_address_snapshot JSONB NOT NULL CHECK (jsonb_typeof(customer_address_snapshot) = 'object'),
  failure_reason TEXT,
  assigned_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delivery_tasks_status_idx
  ON delivery_tasks(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS delivery_tasks_customer_order_idx
  ON delivery_tasks(customer_order_id, id);

CREATE TABLE IF NOT EXISTS delivery_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_task_id BIGINT NOT NULL REFERENCES delivery_tasks(id) ON DELETE RESTRICT,
  agent_id BIGINT NOT NULL REFERENCES delivery_agents(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_assignments_task_active_idx
  ON delivery_assignments(delivery_task_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS delivery_assignments_agent_active_idx
  ON delivery_assignments(agent_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS delivery_assignments_agent_history_idx
  ON delivery_assignments(agent_id, assigned_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS delivery_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_task_id BIGINT NOT NULL REFERENCES delivery_tasks(id) ON DELETE RESTRICT,
  from_status VARCHAR(24),
  to_status VARCHAR(24) NOT NULL,
  actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('admin','dispatcher','agent','system')),
  actor_id VARCHAR(128),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delivery_status_history_task_idx
  ON delivery_status_history(delivery_task_id, created_at, id);
