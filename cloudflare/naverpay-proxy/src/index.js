const UPSTREAM = 'https://iumsnacuxgssnnbckurq.supabase.co/functions/v1/naverpay-order';

function securityHeaders(headers) {
  const next = new Headers(headers);
  next.set('Cache-Control', 'no-store');
  next.set('X-Content-Type-Options', 'nosniff');
  return next;
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (incoming.pathname !== '/naverpay-order' && incoming.pathname !== '/naverpay-order/') {
      return new Response('Not found', { status: 404 });
    }

    const upstream = new URL(UPSTREAM);
    upstream.search = incoming.search;
    const forwarded = new Request(upstream, request);
    const response = await fetch(forwarded);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: securityHeaders(response.headers),
    });
  },
};
