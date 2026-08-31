-- Requeue only the latest failed quote-approval Kakao notice after restoring
-- the customer's current profile or sell-request phone number.
with latest_failed as (
  select o.id, q.customer_id, q.id as quote_id
    from public.telegram_ops_outbox o
    join public.quote_requests q
      on q.id::text = o.payload ->> 'quoteId'
   where o.target = 'customer_kakao'
     and o.event_type = 'customer_quote_approved'
     and o.status = 'failed'
   order by q.created_at desc, o.created_at desc
   limit 1
), contact as (
  select
    f.id as outbox_id,
    coalesce(nullif(p.phone, ''), nullif(s.customer_phone, ''), '') as phone,
    coalesce(nullif(p.display_name, ''), nullif(s.customer_name, ''), '고객') as customer_name
  from latest_failed f
  left join public.profiles p on p.id = f.customer_id
  left join lateral (
    select customer_phone, customer_name
      from public.sell_service_requests
     where quote_request_id = f.quote_id
     order by created_at desc
     limit 1
  ) s on true
)
update public.telegram_ops_outbox o
   set payload = jsonb_set(
                   jsonb_set(o.payload, '{phone}', to_jsonb(c.phone), true),
                   '{customerName}', to_jsonb(c.customer_name), true
                 ),
       status = 'pending',
       attempts = 0,
       available_at = now(),
       processing_at = null,
       sent_at = null,
       last_error = null,
       provider_message_id = null,
       updated_at = now()
  from contact c
 where o.id = c.outbox_id
   and char_length(regexp_replace(c.phone, '\D', '', 'g')) >= 10;
