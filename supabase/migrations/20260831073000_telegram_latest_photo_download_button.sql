-- Add one download-only Telegram message for the latest photo intake.
with latest as (
  select s.*
  from public.sell_service_requests s
  where s.method in ('instant', 'consignment')
    and cardinality(s.photo_urls) > 0
  order by s.created_at desc
  limit 1
)
insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
select
  'photo_download_ready:' || id::text || ':v1',
  'photo_download_ready',
  'quote_room',
  jsonb_build_object(
    'requestId', id,
    'receiptNo', coalesce(receipt_no, ''),
    'photos', coalesce(to_jsonb(photo_urls), '[]'::jsonb)
  )
from latest
on conflict (dedupe_key) do nothing;
