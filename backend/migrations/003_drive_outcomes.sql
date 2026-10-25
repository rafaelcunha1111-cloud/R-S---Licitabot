ALTER TABLE drive_import_candidates ADD COLUMN IF NOT EXISTS outcome_status text NOT NULL DEFAULT 'unclassified';
ALTER TABLE drive_import_candidates ADD CONSTRAINT drive_import_outcome_status_check CHECK (outcome_status IN ('unclassified','won','lost','in_progress'));
