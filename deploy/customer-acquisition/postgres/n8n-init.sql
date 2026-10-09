DO $$
BEGIN
  EXECUTE format('CREATE ROLE n8n_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
    btrim(pg_read_file('/run/secrets/n8n_database_password'), E' \t\r\n'));
END;
$$;
REVOKE ALL ON DATABASE yolpol_n8n FROM PUBLIC;
GRANT CONNECT ON DATABASE yolpol_n8n TO n8n_runtime;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO n8n_runtime;
