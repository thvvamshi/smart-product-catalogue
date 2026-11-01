CREATE TABLE IF NOT EXISTS delivery_task_locations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_task_id BIGINT NOT NULL UNIQUE REFERENCES delivery_tasks(id) ON DELETE CASCADE,
  agent_id BIGINT NOT NULL REFERENCES delivery_agents(id) ON DELETE RESTRICT,
  latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters NUMERIC(8,2) NOT NULL CHECK (accuracy_meters >= 0 AND accuracy_meters <= 10000),
  heading_degrees NUMERIC(6,2) CHECK (heading_degrees IS NULL OR (heading_degrees >= 0 AND heading_degrees <= 360)),
  speed_mps NUMERIC(8,2) CHECK (speed_mps IS NULL OR (speed_mps >= 0 AND speed_mps <= 100)),
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_task_locations_received_order CHECK (received_at >= captured_at - INTERVAL '15 minutes')
);
CREATE INDEX IF NOT EXISTS delivery_task_locations_agent_idx ON delivery_task_locations(agent_id, received_at DESC);
CREATE INDEX IF NOT EXISTS delivery_task_locations_fresh_idx ON delivery_task_locations(delivery_task_id, received_at DESC);
