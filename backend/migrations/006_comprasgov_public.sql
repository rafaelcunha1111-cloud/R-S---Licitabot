CREATE TABLE comprasgov_current (
 procurement_id uuid PRIMARY KEY REFERENCES procurements(id) ON DELETE CASCADE,
 document jsonb NOT NULL, fingerprint text NOT NULL, source_url text NOT NULL,
 fetched_at timestamptz NOT NULL
);
CREATE TABLE comprasgov_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 procurement_id uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
 document jsonb NOT NULL, fingerprint text NOT NULL, source_url text NOT NULL,
 fetched_at timestamptz NOT NULL
);
CREATE INDEX ON comprasgov_observations(procurement_id,fetched_at DESC);
