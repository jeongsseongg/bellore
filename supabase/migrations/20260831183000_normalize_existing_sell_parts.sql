with normalized as (
  select id, item_parts as old_parts,
    case
      when position('warranty' in item_parts) > 0
       and position('box' in item_parts) > 0
       and position('manual' in item_parts) > 0
       and position('extra-link' in item_parts) > 0
       and position('tag' in item_parts) > 0
       and position('receipt' in item_parts) > 0 then '풀세트'
      else replace(replace(replace(replace(replace(replace(
        item_parts,
        'extra-link', '추가 링크'),
        'warranty', '보증서'),
        'manual', '설명서/책자'),
        'receipt', '구매 영수증'),
        'box', '정품 박스'),
        'tag', '정품 택')
    end as new_parts
  from public.quote_requests
  where coalesce(item_parts, '') ~ '(warranty|box|manual|extra-link|tag|receipt)'
)
update public.quote_requests q
   set item_parts = n.new_parts,
       item_detail = replace(q.item_detail, '[구성품] ' || n.old_parts, '[구성품] ' || n.new_parts)
  from normalized n
 where q.id = n.id;

with normalized as (
  select id,
    case
      when position('warranty' in item_parts) > 0
       and position('box' in item_parts) > 0
       and position('manual' in item_parts) > 0
       and position('extra-link' in item_parts) > 0
       and position('tag' in item_parts) > 0
       and position('receipt' in item_parts) > 0 then '풀세트'
      else replace(replace(replace(replace(replace(replace(
        item_parts,
        'extra-link', '추가 링크'),
        'warranty', '보증서'),
        'manual', '설명서/책자'),
        'receipt', '구매 영수증'),
        'box', '정품 박스'),
        'tag', '정품 택')
    end as new_parts
  from public.sell_service_requests
  where coalesce(item_parts, '') ~ '(warranty|box|manual|extra-link|tag|receipt)'
)
update public.sell_service_requests s
   set item_parts = n.new_parts
  from normalized n
 where s.id = n.id;
