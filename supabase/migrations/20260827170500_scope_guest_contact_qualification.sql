do $migration$
declare
  source text;
  corrected text;
begin
  select pg_get_functiondef(
    'public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text)'::regprocedure
  ) into source;

  if source !~ 'from public\.bids\s+where s\.quote_request_id = quote_row\.id'
     or source !~ 'from public\.sell_service_requests s\s+where s\.quote_request_id = quote_row\.id'
  then
    raise exception 'guest_quote_contact_scope_mismatch';
  end if;

  corrected := regexp_replace(
    source,
    'from public\.bids\s+where s\.quote_request_id = quote_row\.id',
    E'from public.bids\n   where quote_request_id = quote_row.id'
  );
  execute corrected;
end
$migration$;

revoke all on function public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text)
  to service_role;
