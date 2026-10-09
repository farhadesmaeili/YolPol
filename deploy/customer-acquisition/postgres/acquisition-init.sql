-- Runs only in this subsystem's fresh database container. Secrets never enter SQL arguments.
DO $$
BEGIN
  EXECUTE format('CREATE ROLE acquisition_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
    btrim(pg_read_file('/run/secrets/acquisition_migrator_password'), E' \t\r\n'));
  EXECUTE format('CREATE ROLE acquisition_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
    btrim(pg_read_file('/run/secrets/acquisition_runtime_password'), E' \t\r\n'));
END;
$$;
REVOKE ALL ON DATABASE yolpol_acquisition FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE yolpol_acquisition TO acquisition_migrator;
GRANT CONNECT ON DATABASE yolpol_acquisition TO acquisition_runtime;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO acquisition_migrator;
GRANT USAGE ON SCHEMA public TO acquisition_runtime;
