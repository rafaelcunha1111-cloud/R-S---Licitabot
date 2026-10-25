CREATE TABLE gmail_accounts (
 email text PRIMARY KEY, refresh_token_encrypted text NOT NULL,
 connected_by uuid NOT NULL REFERENCES users(id), connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gmail_oauth_states (
 state_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 verifier_encrypted text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE gmail_test_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'processing', provider_id text, error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ADD COLUMN provider text CHECK(provider IN ('resend','gmail','whatsapp'));
