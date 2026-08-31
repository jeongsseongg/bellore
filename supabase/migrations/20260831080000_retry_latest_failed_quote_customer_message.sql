-- Requeue only the latest missed customer quote-close notice after SMS fallback deployment.
update public.telegram_ops_outbox
set status = 'pending',
    attempts = 0,
    available_at = now(),
    processing_at = null,
    last_error = null,
    updated_at = now()
where id = (
  select id
  from public.telegram_ops_outbox
  where target = 'customer_kakao'
    and event_type = 'customer_quote_closed'
    and status = 'failed'
    and char_length(regexp_replace(coalesce(payload->>'phone', ''), '\D', '', 'g')) >= 10
  order by created_at desc
  limit 1
);
