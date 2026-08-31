-- Requeue the latest quote-approval Kakao message whose provider accepted the
-- request but later rejected the item description format. The Edge Function
-- now compacts the item description to Kakao's 23-character limit and waits
-- for the final provider delivery status before recording success.
update public.telegram_ops_outbox
   set status = 'pending',
       attempts = 0,
       available_at = now(),
       processing_at = null,
       sent_at = null,
       last_error = null,
       provider_message_id = null,
       updated_at = now()
 where id = (
   select id
     from public.telegram_ops_outbox
    where target = 'customer_kakao'
      and event_type = 'customer_quote_approved'
      and status = 'sent'
      and char_length(regexp_replace(coalesce(payload ->> 'phone', ''), '\D', '', 'g')) >= 10
    order by created_at desc
    limit 1
 );
