CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  reset_token_hash VARCHAR(255) NULL,
  reset_token_expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(64) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_workspaces_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role ENUM('OWNER', 'ADMIN', 'COORDINATOR', 'SPECIALIST') NOT NULL,
  joined_at DATETIME(3) NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  INDEX idx_members_user (user_id),
  CONSTRAINT fk_members_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL UNIQUE,
  plan ENUM('STARTER', 'PRO', 'ENTERPRISE') NOT NULL,
  status ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED') NOT NULL,
  trial_ends_at DATETIME(3) NULL,
  current_period_end DATETIME(3) NULL,
  external_customer_id VARCHAR(128) NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_subscriptions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  external_event_id VARCHAR(128) PRIMARY KEY,
  payload_json JSON NULL,
  processed_at DATETIME(3) NOT NULL,
  UNIQUE INDEX uq_billing_webhook_external_event (external_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookable_resources (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category ENUM('SPECIALIST', 'ROOM', 'EQUIPMENT') NOT NULL,
  status ENUM('ACTIVE', 'IN_MAINTENANCE', 'ARCHIVED') NOT NULL,
  capabilities_json JSON NOT NULL,
  weekly_windows_json JSON NOT NULL,
  maintenance_blocks_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_resources_workspace_status (workspace_id, status),
  INDEX idx_resources_workspace_category (workspace_id, category, status),
  CONSTRAINT fk_resources_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_procedures (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  duration_minutes INT NOT NULL,
  price_cents INT NOT NULL,
  deposit_cents INT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'BRL',
  cancellation_policy_json JSON NOT NULL,
  requirements_json JSON NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_procedures_workspace_active (workspace_id, active),
  CONSTRAINT fk_procedures_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  procedure_id VARCHAR(64) NOT NULL,
  procedure_name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  service_start_at DATETIME(3) NOT NULL,
  service_end_at DATETIME(3) NOT NULL,
  status ENUM('PENDING_DEPOSIT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED') NOT NULL,
  price_cents INT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'BRL',
  deposit_cents INT NOT NULL,
  deposit_status ENUM('NOT_REQUIRED', 'PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_RETAINED', 'FORFEITED', 'PARTIALLY_REFUNDED', 'RETAINED') NOT NULL,
  deposit_expires_at DATETIME(3) NULL,
  cancellation_policy_json JSON NOT NULL,
  retained_cents INT NOT NULL DEFAULT 0,
  refunded_cents INT NOT NULL DEFAULT 0,
  cancellation_reason VARCHAR(512) NULL,
  origin_waitlist_entry_id VARCHAR(64) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_bookings_workspace_window (workspace_id, service_start_at, service_end_at),
  INDEX idx_bookings_workspace_status (workspace_id, status),
  INDEX idx_bookings_pending_expiration (status, deposit_expires_at),
  CONSTRAINT fk_bookings_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_procedure FOREIGN KEY (procedure_id) REFERENCES service_procedures(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_resource_allocations (
  id VARCHAR(128) PRIMARY KEY,
  booking_id VARCHAR(64) NOT NULL,
  workspace_id VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  resource_name VARCHAR(255) NOT NULL,
  category ENUM('SPECIALIST', 'ROOM', 'EQUIPMENT') NOT NULL,
  service_start_at DATETIME(3) NOT NULL,
  service_end_at DATETIME(3) NOT NULL,
  prep_minutes INT NOT NULL,
  cleanup_minutes INT NOT NULL,
  effective_start_at DATETIME(3) NOT NULL,
  effective_end_at DATETIME(3) NOT NULL,
  INDEX idx_allocations_resource_window (workspace_id, resource_id, effective_start_at, effective_end_at),
  INDEX idx_allocations_booking (booking_id),
  CONSTRAINT fk_allocations_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_allocations_resource FOREIGN KEY (resource_id) REFERENCES bookable_resources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  procedure_id VARCHAR(64) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  desired_start_at DATETIME(3) NOT NULL,
  desired_end_at DATETIME(3) NOT NULL,
  priority ENUM('STANDARD', 'VIP') NOT NULL DEFAULT 'STANDARD',
  status ENUM('WAITING', 'OFFERED', 'CLAIMED', 'OFFER_EXPIRED', 'CANCELLED') NOT NULL,
  offered_start_at DATETIME(3) NULL,
  offered_end_at DATETIME(3) NULL,
  reserved_resource_ids_json JSON NULL,
  offered_at DATETIME(3) NULL,
  offer_expires_at DATETIME(3) NULL,
  claimed_booking_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_waitlist_matching (workspace_id, procedure_id, status, created_at),
  INDEX idx_waitlist_workspace_status (workspace_id, status),
  CONSTRAINT fk_waitlist_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_waitlist_procedure FOREIGN KEY (procedure_id) REFERENCES service_procedures(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_channels (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(512) NOT NULL,
  secret VARCHAR(255) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_delivered_at DATETIME(3) NULL,
  INDEX idx_webhook_channels_workspace (workspace_id),
  CONSTRAINT fk_webhook_channels_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NULL,
  action VARCHAR(128) NOT NULL,
  resource_id VARCHAR(64) NULL,
  metadata_json JSON NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  INDEX idx_audit_logs_workspace_occurred (workspace_id, occurred_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_audit_logs_no_update;
CREATE TRIGGER trg_audit_logs_no_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog records are immutable and cannot be updated';

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete;
CREATE TRIGGER trg_audit_logs_no_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog records are immutable and cannot be deleted';
