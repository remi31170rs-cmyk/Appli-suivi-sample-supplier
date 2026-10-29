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
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS supplier_directory (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_directory_name_not_blank CHECK (LENGTH(TRIM(name)) > 0)
);

ALTER TABLE supplier_directory ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE supplier_directory ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE supplier_directory ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE supplier_directory ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_directory_name_lower_unique
  ON supplier_directory (LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS supplier_directory_email_lower_unique
  ON supplier_directory (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS samples (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL,
  supplier_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  supplier_name TEXT,
  date_demande DATE,
  disponible TEXT CHECK (disponible IN ('YES', 'NO')),
  date_disponibilite DATE,
  date_envoi DATE,
  date_reception DATE,
  renvoye BOOLEAN NOT NULL DEFAULT FALSE,
  date_renvoi DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT samples_reference_not_blank CHECK (LENGTH(TRIM(reference)) > 0),
  CONSTRAINT sample_availability_date_required CHECK (disponible <> 'NO' OR date_disponibilite IS NOT NULL),
  CONSTRAINT sample_return_date_required CHECK (NOT renvoye OR date_renvoi IS NOT NULL)
);

ALTER TABLE samples ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS samples_reference_lower_unique ON samples (LOWER(reference));
CREATE INDEX IF NOT EXISTS samples_supplier_id_idx ON samples (supplier_id);
