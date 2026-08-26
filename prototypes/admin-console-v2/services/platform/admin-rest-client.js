const SUPABASE_URL = 'https://iumsnacuxgssnnbckurq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bXNuYWN1eGdzc25uYmNrdXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDQ5ODQsImV4cCI6MjA5NjIyMDk4NH0.lwej8g4YCaiYuoQSXczwRp6ez-X26DD5d1ycMkYwpIk';

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function errorMessage(payload, response) {
  return payload?.message || payload?.error_description || payload?.error || `운영 요청에 실패했습니다. (${response.status})`;
}

export function createAdminRestClient({ getAccessToken, fetchImpl = window.fetch.bind(window) }) {
  async function request(path, { method = 'GET', body, headers = {}, prefer, raw = false } = {}) {
    const token = await getAccessToken();
    const response = await fetchImpl(`${SUPABASE_URL}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined || body instanceof Blob ? {} : { 'Content-Type': 'application/json' }),
        ...(prefer ? { Prefer: prefer } : {}),
        ...headers
      },
      body: body === undefined ? undefined : (body instanceof Blob ? body : JSON.stringify(body))
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('json') ? await response.json().catch(() => null) : await response.text().catch(() => '');
    if (!response.ok) {
      const error = new Error(errorMessage(payload, response));
      error.status = response.status;
      error.code = payload?.code || '';
      error.details = payload?.details || '';
      throw error;
    }
    return raw ? { data: payload, response } : payload;
  }

  function list(table, params = {}) {
    return request(`/rest/v1/${table}${queryString(params)}`);
  }

  function insert(table, row) {
    return request(`/rest/v1/${table}`, { method: 'POST', body: row, prefer: 'return=representation' });
  }

  function update(table, filters, patch) {
    return request(`/rest/v1/${table}${queryString(filters)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
  }

  function remove(table, filters) {
    return request(`/rest/v1/${table}${queryString(filters)}`, { method: 'DELETE', prefer: 'return=representation' });
  }

  function upsert(table, row, onConflict = 'key') {
    return request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  function rpc(name, body = {}) {
    return request(`/rest/v1/rpc/${name}`, { method: 'POST', body });
  }

  function edge(name, body = {}) {
    return request(`/functions/v1/${name}`, { method: 'POST', body });
  }

  async function upload(file, folder = 'admin') {
    if (!(file instanceof Blob)) throw new Error('업로드할 이미지 파일이 없습니다.');
    const extension = (file.type?.split('/')[1] || 'bin').replace('jpeg', 'jpg');
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `${folder}/${id}.${extension}`;
    await request(`/storage/v1/object/photos/${path}`, {
      method: 'POST', body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false', 'Cache-Control': '31536000' }
    });
    return `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
  }

  return { list, insert, update, remove, upsert, rpc, edge, upload };
}
