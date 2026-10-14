-- Provision discovery_staff_read_owner (NOLOGIN) and discovery_staff_reader
-- (LOGIN) separately before migration. No credential or role is created here.
-- The read owner has no membership in a write-capable role.
GRANT SELECT ON public.acquisition_discovery_batches, public.acquisition_discovery_candidates,
  public.acquisition_discovery_evidence, public.acquisition_discovery_identity_matches,
  public.acquisition_discovery_reviews, public.acquisition_discovery_suppression_marks,
  public.acquisition_discovery_policies, public.acquisition_suppression_entries
  TO discovery_staff_read_owner;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquisition_discovery_status(public.acquisition_discovery_candidates),
  public.acquisition_discovery_policy(text,text,text), public.acquisition_discovery_blocked(text,text,text)
  TO discovery_staff_read_owner;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_staff_discovery_queue(after_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
  SET lock_timeout = '3s' SET statement_timeout = '5s' SET TimeZone = 'UTC' AS $$
DECLARE c public.acquisition_discovery_candidates; result jsonb := '[]'::jsonb;
  facts jsonb; findings jsonb; review_count integer; seen integer := 0; last_id uuid; next_id uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  -- Discovery mutations take this lock exclusively. A read observes one current
  -- committed projection and cannot race a policy or suppression transition.
  PERFORM pg_advisory_xact_lock_shared(820082);
  FOR c IN SELECT * FROM public.acquisition_discovery_candidates
    WHERE after_id IS NULL OR id > after_id ORDER BY id LIMIT 21 LOOP
    seen := seen + 1;
    IF seen = 21 THEN next_id := last_id; EXIT; END IF;
    SELECT count(*) INTO review_count FROM (SELECT 1 FROM public.acquisition_discovery_reviews
      WHERE candidate_id = c.id LIMIT 33) bounded;
    IF (SELECT count(*) FROM (SELECT 1 FROM public.acquisition_discovery_evidence
          WHERE candidate_id = c.id LIMIT 33) bounded) NOT BETWEEN 1 AND 32
      OR (SELECT count(*) FROM (SELECT 1 FROM public.acquisition_discovery_identity_matches
          WHERE candidate_id = c.id LIMIT 21) bounded) > 20
      OR review_count > 32 OR review_count <> c.version THEN
      RAISE EXCEPTION 'INVALID_PROJECTION';
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'finding',e.finding)
      ORDER BY e.created_at,e.id),'[]'::jsonb) INTO facts
      FROM public.acquisition_discovery_evidence e WHERE e.candidate_id = c.id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,
      'resolved',EXISTS(SELECT 1 FROM public.acquisition_discovery_reviews r
        WHERE r.finding_id=m.id AND r.decision='RESOLVE_DISTINCT')) ORDER BY m.id),'[]'::jsonb)
      INTO findings FROM public.acquisition_discovery_identity_matches m WHERE m.candidate_id = c.id;
    result := result || jsonb_build_array(public.acquisition_discovery_status(c) ||
      jsonb_build_object('name',c.name,'country',c.country,'domain',c.domain,
        'segment',c.segment,'evidence',facts,'matches',findings));
    last_id := c.id;
  END LOOP;
  RETURN jsonb_build_object('candidates',result,'nextCursor',next_id);
END; $$;
--> statement-breakpoint
ALTER FUNCTION public.acquisition_staff_discovery_queue(uuid) OWNER TO discovery_staff_read_owner;
--> statement-breakpoint
SET ROLE discovery_staff_read_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acquisition_staff_discovery_queue(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquisition_staff_discovery_queue(uuid) TO discovery_staff_reader;
--> statement-breakpoint
RESET ROLE;
