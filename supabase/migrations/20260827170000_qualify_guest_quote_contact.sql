do $migration$
declare
  source text;
  corrected text;
begin
  select pg_get_functiondef(
    'public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text)'::regprocedure
  ) into source;

  if source not like '%select coalesce(customer_phone, ''''), coalesce(nullif(customer_name, ''''), ''고객'')%'
     or source not like '%from public.sell_service_requests%'
  then
    raise exception 'guest_quote_contact_source_mismatch';
  end if;

  corrected := replace(
    source,
    'select coalesce(customer_phone, ''''), coalesce(nullif(customer_name, ''''), ''고객'')',
    'select coalesce(s.customer_phone, ''''), coalesce(nullif(s.customer_name, ''''), ''고객'')'
  );
  corrected := replace(
    corrected,
    'from public.sell_service_requests',
    'from public.sell_service_requests s'
  );
  corrected := replace(corrected, 'where quote_request_id = quote_row.id', 'where s.quote_request_id = quote_row.id');
  corrected := replace(corrected, 'order by created_at desc', 'order by s.created_at desc');

  execute corrected;
end
$migration$;

revoke all on function public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text)
  to service_role;
