CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 password_hash text NOT NULL, email_alerts boolean NOT NULL DEFAULT false,
 whatsapp_phone text, whatsapp_opt_in boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON auth_sessions(expires_at);
CREATE TABLE procurements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 portal text NOT NULL CHECK(portal IN ('Comprasnet','BLL','BNC','Licitanet','Licitar Digital','Portal de Compras Públicas','BBMNET')),
 external_ref text NOT NULL, agency text NOT NULL, object text NOT NULL,
 source text NOT NULL CHECK(source IN ('manual','verified')), verified_at timestamptz,
 monitoring_enabled boolean NOT NULL DEFAULT true, next_check_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz, last_error text, consecutive_errors integer NOT NULL DEFAULT 0,
 cursor text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,portal,external_ref), UNIQUE(id,user_id)
);
CREATE INDEX ON procurements(next_check_at) WHERE monitoring_enabled;
CREATE TABLE procurement_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
 external_id text NOT NULL, status text NOT NULL, source text NOT NULL CHECK(source IN ('manual','verified')),
 observed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(procurement_id,external_id)
);
CREATE TABLE messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
 external_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('message','summons')),
 body text NOT NULL, occurred_at timestamptz NOT NULL, collected_at timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL CHECK(source='verified'), UNIQUE(procurement_id,external_id)
);
CREATE VIEW summons AS SELECT * FROM messages WHERE kind='summons';
CREATE TABLE deadlines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
 external_id text NOT NULL, title text NOT NULL, due_at timestamptz NOT NULL,
 source text NOT NULL CHECK(source IN ('manual','verified')), completed_at timestamptz,
 UNIQUE(procurement_id,external_id)
);
CREATE TABLE query_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 status text NOT NULL CHECK(status IN ('running','success','blocked','error')),
 error_code text, new_messages integer NOT NULL DEFAULT 0
);
CREATE INDEX ON query_history(procurement_id,started_at DESC);
CREATE TABLE activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), procurement_id uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
 event_key text NOT NULL, kind text NOT NULL, title text NOT NULL, body text NOT NULL,
 source text NOT NULL CHECK(source IN ('manual','verified')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(procurement_id,event_key)
);
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 activity_id uuid NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('panel','email','whatsapp')),
 status text NOT NULL CHECK(status IN ('queued','pending_configuration','processing','retry','provider_accepted','delivered','delivery_failed','delivery_unknown','failed')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz, provider_id text, last_error text, accepted_at timestamptz, delivered_at timestamptz,
 read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,activity_id,channel)
);
CREATE UNIQUE INDEX ON notifications(channel,provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX ON notifications(next_attempt_at) WHERE status IN ('queued','retry','pending_configuration');
CREATE TABLE delivery_receipts (
 event_key text PRIMARY KEY, channel text NOT NULL, provider_id text NOT NULL,
 status text NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE worker_health (name text PRIMARY KEY, heartbeat_at timestamptz NOT NULL);
