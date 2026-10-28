CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'supplier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_lowercase CHECK (email = LOWER(email))
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;

CREATE TABLE IF NOT EXISTS samples (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL,
  supplier_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  date_demande DATE,
  disponible TEXT CHECK (disponible IN ('YES', 'NO')),
  date_disponibilite DATE,
  date_envoi DATE,
  date_reception DATE,
  renvoye BOOLEAN NOT NULL DEFAULT FALSE,
  date_renvoi DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT samples_reference_not_blank CHECK (LENGTH(TRIM(reference)) > 0),
  CONSTRAINT sample_availability_date_required CHECK (disponible <> 'NO' OR date_disponibilite IS NOT NULL),
  CONSTRAINT sample_return_date_required CHECK (NOT renvoye OR date_renvoi IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS samples_reference_lower_unique ON samples (LOWER(reference));
CREATE INDEX IF NOT EXISTS samples_supplier_id_idx ON samples (supplier_id);
