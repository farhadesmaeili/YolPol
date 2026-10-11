-- Mounted only by the guarded tmpfs validation overlay, never normal Compose.
DO $$
BEGIN
  IF current_database() <> 'yolpol_acquisition' OR
    btrim(pg_read_file('/disposable-task0082'), E' \t\r\n') <> 'task0082-tmpfs' THEN
    RAISE EXCEPTION 'Disposable discovery provisioning refused';
  END IF;
  CREATE ROLE discovery_mutation_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE discovery_provisioner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  EXECUTE format('CREATE ROLE discovery_intake LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    btrim(pg_read_file('/run/secrets/discovery_intake_password')));
  EXECUTE format('CREATE ROLE discovery_reviewer LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    btrim(pg_read_file('/run/secrets/discovery_reviewer_password')));
END;
$$;
GRANT CONNECT ON DATABASE yolpol_acquisition TO discovery_intake, discovery_reviewer;
GRANT USAGE ON SCHEMA public TO discovery_intake, discovery_reviewer, discovery_mutation_owner, discovery_provisioner;
-- Migration may install functions as this owner, but capability logins have no memberships.
GRANT discovery_mutation_owner TO acquisition_migrator WITH INHERIT FALSE, SET TRUE;
-- Ownership transfer requires CREATE; the guarded administrator revokes it after migration.
GRANT CREATE ON SCHEMA public TO discovery_mutation_owner;
ALTER ROLE discovery_intake SET statement_timeout = '5s';
ALTER ROLE discovery_intake SET lock_timeout = '3s';
ALTER ROLE discovery_intake SET transaction_timeout = '8s';
ALTER ROLE discovery_reviewer SET statement_timeout = '5s';
ALTER ROLE discovery_reviewer SET lock_timeout = '3s';
ALTER ROLE discovery_reviewer SET transaction_timeout = '8s';
