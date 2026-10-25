CREATE TABLE drive_import_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 drive_folder_id text NOT NULL,
 folder_name text NOT NULL,
 folder_url text NOT NULL,
 year integer NOT NULL DEFAULT 2026,
 review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','imported','dismissed')),
 procurement_id uuid REFERENCES procurements(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,drive_folder_id)
);
CREATE INDEX ON drive_import_candidates(user_id,review_status,folder_name);
