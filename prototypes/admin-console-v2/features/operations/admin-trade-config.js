import { bool, dateTime, field, firstImage, money, tone } from './admin-operation-model.js?v=20260826-admin-crud-v1';

const orderStatuses = ['pending', 'paid', 'inspecting', 'preparing', 'shipping', 'delivered', 'confirmed', 'cancel_req', 'cancelled', 'refunded'];
const returnStatuses = ['requested', 'approved', 'collecting', 'inspecting', 'done', 'rejected'];
const quoteStatuses = ['pending', 'open', 'closed', 'suspended'];
const auctionStatuses = ['scheduled', 'live', 'ended', 'canceled'];

export function tradeConfigs(service, operatorId) {
  return {
    orders: {
      title: '주문 관리', description: '운영 주문과 결제·배송 상태를 실제 데이터로 관리합니다.', primaryAction: '',
      columns: ['주문', '결제', '처리 상태', '배송', '접수'],
      load: () => service.listOrders(),
      row: (item) => ({ id: item.id, title: item.product_name || item.product_brand || item.order_no, sub: `${item.order_no || '-'} · ${item.buyer_name || '고객'}`, image: firstImage(item), cells: [money(item.amount), item.status || 'pending', item.tracking_no ? `${item.courier || ''} ${item.tracking_no}` : '운송장 없음', dateTime(item.created_at)], status: tone(item.status), statusLabel: item.status || 'pending', raw: item }),
      fields: () => [field('status', '주문 상태', 'select', { options: orderStatuses }), field('courier', '택배사'), field('tracking_no', '운송장 번호'), field('admin_memo', '관리자 메모', 'textarea')],
      save: (item, values) => service.updateOrder(item.id, values),
      actions: [{ id: 'refund', label: '결제 환불', danger: true, confirm: '결제대행사 환불을 실행합니다. 계속할까요?', run: (item, values) => service.refundOrder(item.order_no, values.admin_memo || '관리자 환불') }]
    },
    returns: {
      title: '교환 · 반품', description: '접수된 교환·반품과 회수·검수 상태를 관리합니다.', columns: ['접수', '유형', '사유', '처리 상태', '접수'],
      load: () => service.listReturns(),
      row: (item) => ({ id: item.id, title: item.order_id || '연결 주문', sub: item.detail || item.reason || '-', cells: [item.rtype || 'return', item.reason || '-', item.status || 'requested', dateTime(item.created_at)], status: tone(item.status), statusLabel: item.status || 'requested', raw: item }),
      fields: () => [field('status', '처리 상태', 'select', { options: returnStatuses }), field('admin_memo', '관리자 메모', 'textarea')],
      save: (item, values) => service.updateReturn(item.id, values),
      actions: [
        { id: 'approve', label: '요청 승인', when: (item) => item.status === 'requested', run: (item) => service.updateReturn(item.id, { status: 'approved' }) },
        { id: 'reject', label: '요청 거절', danger: true, when: (item) => !['done', 'rejected'].includes(item.status), confirm: '이 교환·반품 요청을 거절할까요?', run: (item) => service.updateReturn(item.id, { status: 'rejected' }) },
        { id: 'resume', label: '처리 재개', when: (item) => ['done', 'rejected'].includes(item.status), run: (item) => service.updateReturn(item.id, { status: 'requested', resolved_at: null }) }
      ]
    },
    quotes: {
      title: '비교견적 관리', description: '승인·진행·선택·정지 견적과 업체 제안을 실제 데이터로 관리합니다.', columns: ['신청', '상태', '제안', '최고금액', '접수'],
      load: () => service.listQuotes(),
      row: (item) => {
        const bids = item.bids || [];
        const highest = bids.reduce((max, bid) => Math.max(max, Number(bid.amount) || 0), 0);
        return { id: item.id, title: [item.item_brand, item.item_name].filter(Boolean).join(' ') || '비교견적', sub: item.item_ref || item.item_detail || '-', image: firstImage(item), cells: [item.status || 'pending', `${bids.length}건`, money(highest), dateTime(item.created_at)], status: tone(item.status), statusLabel: item.status || 'pending', raw: item };
      },
      fields: (item) => [
        field('status', '견적 상태', 'select', { options: item?.status === 'awarded' ? ['awarded'] : quoteStatuses, disabled: item?.status === 'awarded' }),
        field('customer_contacted', '고객 연락 완료', 'checkbox'), field('vendor_contacted', '업체 연락 완료', 'checkbox'), field('trade_completed', '거래 완료', 'checkbox'),
        field('vendor_name', '추가 제안 업체명'), field('vendor_phone', '업체 연락처'), field('bid_amount', '추가 제안금액', 'number'), field('bid_message', '제안 메모', 'textarea')
      ],
      save: async (item, values) => {
        if (values.status !== item.status) {
          if (item.status === 'pending' && values.status === 'open') await service.approveQuote(item.id);
          else await service.setQuoteStatus(item.id, values.status);
        }
        if (values.bid_amount && values.vendor_name) await service.addAdminBid({ quoteId: item.id, operatorId, vendorName: values.vendor_name, vendorPhone: values.vendor_phone, amount: values.bid_amount, message: values.bid_message });
        if (values.status === 'awarded') await service.updateQuoteFollowup(item.id, { customer_contacted: bool(values.customer_contacted), vendor_contacted: bool(values.vendor_contacted), trade_completed: bool(values.trade_completed) });
      },
      actions: [
        { id: 'approve', label: '견적 승인', when: (item) => item.status === 'pending', run: (item) => service.approveQuote(item.id) },
        { id: 'suspend', label: '견적 정지', when: (item) => item.status === 'open', run: (item) => service.setQuoteStatus(item.id, 'suspended') },
        { id: 'resume', label: '견적 재개', when: (item) => item.status === 'suspended', run: (item) => service.setQuoteStatus(item.id, 'open') },
        { id: 'delete', label: '견적 삭제', danger: true, confirm: '견적과 연결된 제안이 삭제될 수 있습니다. 계속할까요?', promptText: '삭제', run: (item) => service.deleteQuote(item.id) }
      ]
    },
    auctions: {
      title: '경매 관제소', description: '예약·진행·종료 경매와 입찰 현황을 실제 데이터로 관리합니다.', primaryAction: '경매 예약', columns: ['경매', '시작가', '현재가', '일정', '상태'],
      load: () => service.listAuctions(),
      row: (item) => ({ id: item.id, title: [item.brand, item.model].filter(Boolean).join(' ') || item.listing_id, sub: `입찰 ${item.bid_count || 0}회`, image: firstImage(item), cells: [money(item.start_price), money(item.current_price), `${dateTime(item.start_at)} ~ ${dateTime(item.end_at)}`, item.status || 'scheduled'], status: tone(item.status), statusLabel: item.status || 'scheduled', raw: item }),
      fields: () => [field('listing_id', '상품번호'), field('start_price', '시작가', 'number'), field('min_increment', '최소 입찰단위', 'number'), field('reserve_price', '최소 낙찰가', 'number'), field('guaranteed_price', '보장금액', 'number'), field('start_at', '시작일시', 'datetime-local'), field('end_at', '종료일시', 'datetime-local'), field('eligibility', '참여 자격', 'select', { options: ['all', 'adult'] }), field('status', '상태', 'select', { options: auctionStatuses })],
      save: (item, values) => item ? service.updateAuction(item.id, values) : service.createAuction({ ...values, created_by: operatorId }),
      actions: [
        { id: 'cancel', label: '경매 취소', danger: true, when: (item) => !['ended', 'canceled'].includes(item.status), confirm: '진행 중인 입찰을 확인했습니다. 경매를 취소할까요?', run: (item) => service.updateAuction(item.id, { status: 'canceled' }) },
        { id: 'resume', label: '경매 재개', when: (item) => item.status === 'canceled', run: (item) => service.updateAuction(item.id, { status: 'scheduled' }) },
        { id: 'delete', label: '경매 삭제', danger: true, when: (item) => Number(item.bid_count || 0) === 0, confirm: '입찰이 없는 경매를 삭제할까요?', promptText: '삭제', run: (item) => service.deleteAuction(item.id) }
      ]
    }
  };
}
