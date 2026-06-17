/* ============================================================
   벨로르(BELLORE) · 백엔드 연동 레이어 (Supabase)
   ------------------------------------------------------------
   - 디자인/마크업은 그대로 두고 기능만 붙입니다.
   - 기존 script.js 가 사용하던 window.NWBackend 인터페이스를
     그대로 구현하여(Firebase → Supabase 교체) 기존 동작을 유지하고,
     레퍼런스(platform/app.js)의 비교견적·업체승인·커뮤니티·후기
     로직을 이 사이트의 DOM 위에 이식합니다.

   데이터 모델 매핑 (이 사이트 개념 → Supabase 테이블)
   - 비교견적 신청(고객)        → quote_requests (+ bids)
       brand = item_brand, model = item_name
   - 벨로르 판매시계(관리자)     → listings (category='벨로르판매')
       brand = title, model = description, photos = image_urls
   - 고객 판매 마켓             → listings (category='고객판매')
   - 인사이트/커뮤니티(관리자)   → community_posts (category)
   - 매입후기                  → reviews
   - 알림                      → notifications (실시간)
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.BELLORE_SUPABASE || {};
  var CATS = window.BELLORE_CATEGORIES || { listing: {}, insight: {} };
  var adminEmails = (window.NW_ADMIN_EMAILS || []).map(function (e) {
    return String(e).trim().toLowerCase();
  });

  function isConfigured() {
    return !!(CFG.url && CFG.anonKey && window.supabase &&
      typeof window.supabase.createClient === 'function');
  }

  // 비활성 기본 객체 (설정/SDK 없으면 데모 모드로 동작)
  var Backend = {
    configured: isConfigured(),
    enabled: false,
    ready: Promise.resolve(),
    currentUser: function () { return null; },
    isAdmin: function () { return false; },
    isVendor: function () { return false; },
    isApprovedVendor: function () { return false; },
    onAuthChange: function () { return function () {}; },
    getSiteContent: function () { return Promise.resolve(null); },
    saveSiteContent: function () { return Promise.reject(new Error('NOT_CONFIGURED')); },
    phoneVerified: function () { return false; },
    accountVerified: function () { return false; },
    accountSubmitted: function () { return false; },
    sendPhoneOtp: function () { return Promise.reject(new Error('NOT_CONFIGURED')); },
    verifyPhoneOtp: function () { return Promise.reject(new Error('NOT_CONFIGURED')); },
    submitVendorAccount: function () { return Promise.reject(new Error('NOT_CONFIGURED')); },
    verifyAccountAuto: function () { return Promise.reject(new Error('AUTO_VERIFY_NOT_CONFIGURED')); },
    setAccountVerified: function () { return Promise.reject(new Error('NOT_CONFIGURED')); }
  };
  window.NWBackend = Backend;

  if (!Backend.configured) {
    console.warn('[BELLORE] Supabase 미설정 — 데모 모드로 동작합니다.');
    return;
  }

  var sb = window.supabase.createClient(CFG.url, CFG.anonKey);
  window.sbClient = sb; // 디버깅/추가 기능용

  var rawUser = null;     // supabase auth user
  var profile = null;     // public.profiles row
  var authUser = null;    // 매핑된 사용자 {uid,email,displayName}
  var authCbs = [];       // onAuthChange 구독자
  var stateKnown = false; // 최초 세션 로드 완료 여부

  /* ---------------- 공통 유틸 ---------------- */
  function tsObj(iso) { var ms = Date.parse(iso); return { seconds: isNaN(ms) ? 0 : Math.floor(ms / 1000) }; }

  function dataURLtoBlob(dataurl) {
    var parts = dataurl.split(',');
    var mime = ((parts[0].match(/:(.*?);/) || [])[1]) || 'image/jpeg';
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // data URL(또는 이미 http URL) 배열 → 공개 URL 배열
  function uuid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'x' + Date.now() + Math.random().toString(16).slice(2);
  }
  function uploadPhotos(items, max) {
    items = (items || []).slice(0, max || 10);
    var out = [];
    var chain = Promise.resolve();
    items.forEach(function (it) {
      chain = chain.then(function () {
        if (typeof it === 'string' && !it.startsWith('data:')) { out.push(it); return; }
        var blob = (typeof it === 'string') ? dataURLtoBlob(it) : it;
        var ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
        var path = (rawUser ? rawUser.id : 'anon') + '/' + uuid() + '.' + ext;
        return sb.storage.from('photos').upload(path, blob, { cacheControl: '3600', upsert: false })
          .then(function (res) {
            // 업로드 실패를 조용히 삼키면 '저장 성공'인데 이미지가 빈 채로 저장된다.
            // → 실제 원인(스토리지 버킷/권한)이 그대로 노출되도록 에러를 던진다.
            if (res.error) { throw new Error('이미지 업로드 실패: ' + (res.error.message || '스토리지 권한/버킷을 확인하세요') + ' (Storage 버킷 photos 가 public 인지, 업로드 정책이 있는지 확인)'); }
            out.push(sb.storage.from('photos').getPublicUrl(path).data.publicUrl);
          });
      });
    });
    return chain.then(function () { return out; });
  }

  // 실시간: 지정 테이블 변경 시 onChange 재호출
  function channelRefetch(name, tables, onChange) {
    var ch = sb.channel(name + ':' + uuid());
    tables.forEach(function (t) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onChange);
    });
    ch.subscribe();
    return function () { try { sb.removeChannel(ch); } catch (e) {} };
  }

  /* ---------------- 인증/프로필 ---------------- */
  function mapUser() {
    if (!rawUser) { authUser = null; return; }
    var meta = rawUser.user_metadata || {};
    authUser = {
      uid: rawUser.id,
      email: rawUser.email || '',
      displayName: (profile && profile.display_name) || meta.display_name || (rawUser.email || '').split('@')[0]
    };
  }

  function loadProfile() {
    if (!rawUser) { profile = null; return Promise.resolve(); }
    return sb.from('profiles').select('*').eq('id', rawUser.id).single()
      .then(function (res) { profile = res.data || null; })
      .catch(function () { profile = null; });
  }

  Backend.currentUser = function () { return authUser; };
  Backend.role = function () { return (profile && profile.role) || (rawUser ? 'customer' : 'guest'); };
  // 관리자 판정은 DB 역할(profiles.role='admin')만 기준 — 화면과 권한(RLS)을 일치시킴
  Backend.isAdmin = function () { return !!(profile && profile.role === 'admin'); };
  Backend.isVendor = function () { return Backend.role() === 'vendor'; };
  Backend.isApprovedVendor = function () { return Backend.isVendor() && !!(profile && profile.approved); };
  // 휴대폰 인증 여부: auth의 phone_confirmed_at 또는 profiles.phone_verified
  Backend.phoneVerified = function () {
    return !!(rawUser && rawUser.phone_confirmed_at) || !!(profile && profile.phone_verified);
  };
  // 업체 계좌 인증 여부(관리자 승인 또는 자동 실명조회 완료)
  Backend.accountVerified = function () { return !!(profile && profile.account_verified); };
  Backend.accountSubmitted = function () { return !!(profile && (profile.account_submitted_at || profile.bank_account)); };

  function authInfo() {
    return {
      isAdmin: Backend.isAdmin(),
      role: Backend.role(),
      approved: !!(profile && profile.approved),
      isApprovedVendor: Backend.isApprovedVendor(),
      points: (profile && profile.points) || 0,
      grade: (profile && profile.grade) || 'family',
      phoneVerified: Backend.phoneVerified(),
      accountVerified: Backend.accountVerified(),
      accountSubmitted: Backend.accountSubmitted(),
      phone: (profile && profile.phone) || (rawUser && rawUser.phone) || '',
      notifyQuotes: !(profile && profile.notify_quotes === false), // 기본 켜짐
      vip: !!(profile && profile.vip),
      companyName: (profile && profile.company_name) || '',
      logoUrl: (profile && profile.logo_url) || '',
      suspended: !!(profile && profile.suspended)
    };
  }
  function notifyAuth() {
    var info = authInfo();
    authCbs.forEach(function (cb) { try { cb(authUser, info); } catch (e) {} });
    document.dispatchEvent(new CustomEvent('bellore:auth', { detail: { user: authUser, info: info } }));
  }

  Backend.onAuthChange = function (cb) {
    authCbs.push(cb);
    if (stateKnown) cb(authUser, authInfo());
    return function () {
      var i = authCbs.indexOf(cb);
      if (i !== -1) authCbs.splice(i, 1);
    };
  };

  Backend.signUp = function (data) {
    var role = data.role === 'vendor' ? 'vendor' : 'customer';
    var uname = (data.username || '').trim();
    // 아이디 중복 사전 검사
    var pre = uname
      ? sb.rpc('email_for_username', { uname: uname }).then(function (r) {
          if (r.data) throw new Error('USERNAME_TAKEN');
        })
      : Promise.resolve();
    return pre.then(function () {
      return sb.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            display_name: data.name || '',
            username: uname || null,
            role: role,
            company_name: data.company || null,
            phone: data.phone || null
          }
        }
      });
    }).then(function (res) {
      if (res.error) throw res.error;
      // 트리거가 채우지 않는 항목은 세션이 있으면 보강
      if (res.data && res.data.session) {
        var patch = {};
        if (data.phone) patch.phone = data.phone;
        if (uname) patch.username = uname;
        if (Object.keys(patch).length) {
          sb.from('profiles').update(patch)
            .eq('id', res.data.user.id).then(function () {}, function () {});
        }
      }
      return res.data.user;
    });
  };

  // 아이디(username) 또는 이메일로 로그인
  Backend.signIn = function (data) {
    var input = (data.idOrEmail || data.email || '').trim();
    var resolveEmail = (input.indexOf('@') !== -1)
      ? Promise.resolve(input)
      : sb.rpc('email_for_username', { uname: input }).then(function (r) {
          if (r.error || !r.data) throw new Error('USER_NOT_FOUND');
          return r.data;
        });
    return resolveEmail.then(function (email) {
      return sb.auth.signInWithPassword({ email: email, password: data.password });
    }).then(function (res) {
      if (res.error) throw res.error;
      return { displayName: (res.data.user.user_metadata || {}).display_name || '', email: res.data.user.email };
    });
  };

  Backend.signInWithGoogle = function () {
    return sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    }).then(function (res) {
      if (res.error) throw res.error;
      return { displayName: '' }; // OAuth는 리디렉션되므로 실제 반환 전에 페이지 이동
    });
  };

  Backend.signInWithKakao = function () {
    return sb.auth.signInWithOAuth({
      provider: 'kakao',
      // 닉네임만 요청 — 이메일/프로필사진 동의항목 미설정으로 인한 KOE205 방지
      options: { scopes: 'profile_nickname', redirectTo: location.origin + location.pathname }
    }).then(function (res) {
      if (res.error) throw res.error;
      return { displayName: '' };
    });
  };

  Backend.signOut = function () { return sb.auth.signOut(); };

  // 비밀번호 재설정 메일 발송 (아이디=이메일)
  Backend.resetPassword = function (email) {
    return sb.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    }).then(function (res) { if (res.error) throw res.error; });
  };

  // 로그인 사용자 본인 비밀번호 직접 변경
  Backend.updatePassword = function (newPw) {
    if (!rawUser) return Promise.reject(new Error('NOT_LOGGED_IN'));
    if (!newPw || String(newPw).length < 6) return Promise.reject(new Error('비밀번호는 6자 이상이어야 합니다.'));
    return sb.auth.updateUser({ password: newPw })
      .then(function (res) { if (res.error) throw res.error; return true; });
  };

  /* ---------------- 휴대폰(SMS OTP) 인증 ----------------
     ※ 실제 발송하려면 Supabase 대시보드 > Authentication > Providers > Phone 활성화 +
        SMS 제공자(Twilio/MessageBird/Vonage 등) 키 등록이 필요합니다. */
  function toE164(phone) {
    var d = String(phone || '').replace(/[^0-9+]/g, '');
    if (d.indexOf('+') === 0) return d;
    if (d.indexOf('0') === 0) return '+82' + d.slice(1); // 010… → +8210…
    if (d.indexOf('82') === 0) return '+' + d;
    return '+' + d;
  }
  Backend.normalizePhone = toE164;
  // 인증번호 발송: 로그인된 사용자의 전화번호를 추가/변경 → SMS OTP 전송
  Backend.sendPhoneOtp = function (phone) {
    if (!rawUser) return Promise.reject(new Error('NOT_LOGGED_IN'));
    return sb.auth.updateUser({ phone: toE164(phone) })
      .then(function (res) { if (res.error) throw res.error; return true; });
  };
  // 인증번호 확인 → 성공 시 profiles.phone + phone_verified 갱신
  Backend.verifyPhoneOtp = function (phone, token) {
    var e164 = toE164(phone);
    return sb.auth.verifyOtp({ phone: e164, token: String(token || '').trim(), type: 'phone_change' })
      .then(function (res) {
        if (res.error) throw res.error;
        if (rawUser) {
          sb.from('profiles').update({ phone: e164, phone_verified: true })
            .eq('id', rawUser.id).then(function () {}, function () {});
          if (profile) { profile.phone = e164; profile.phone_verified = true; }
        }
        return loadProfile().then(notifyAuth, notifyAuth);
      });
  };

  /* ---------------- 업체 계좌 인증 ---------------- */
  // 통장사본 업로드 + 계좌정보 저장(관리자 승인 대기 상태)
  Backend.submitVendorAccount = function (data) {
    if (!rawUser) return Promise.reject(new Error('NOT_LOGGED_IN'));
    return uploadPhotos(data.bankbook ? [data.bankbook] : [], 1).then(function (urls) {
      var patch = {
        bank_holder: (data.holder || '').trim(),
        bank_name: (data.bank || '').trim(),
        bank_account: (data.account || '').replace(/[^0-9-]/g, ''),
        account_submitted_at: new Date().toISOString()
      };
      if (urls[0]) patch.bankbook_url = urls[0];
      return sb.from('profiles').update(patch).eq('id', rawUser.id)
        .then(function (r) {
          if (r.error) throw r.error;
          return loadProfile().then(notifyAuth, notifyAuth);
        });
    });
  };
  // 자동 계좌 실명조회(1원 인증 등) — 외부 핀테크 API 연동 자리.
  // 키/계약 준비되면 아래에 실제 호출(Edge Function 권장)을 연결하세요.
  Backend.verifyAccountAuto = function (/* data */) {
    return Promise.reject(new Error('AUTO_VERIFY_NOT_CONFIGURED'));
  };
  // 관리자 수동 계좌 승인/취소
  Backend.setAccountVerified = function (id, ok) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    var patch = { account_verified: !!ok, account_verified_at: ok ? new Date().toISOString() : null };
    return sb.from('profiles').update(patch).eq('id', id)
      .then(function (r) {
        if (r.error) throw r.error;
        if (ok) Backend.createNotification({ uid: id, type: 'account', text: '계좌 인증이 완료되었습니다.' });
        refreshVendors();
      });
  };

  /* ---------------- 비교견적 (quote_requests + bids) ---------------- */
  function mapQuote(q, bidsByQuote) {
    var bs = (bidsByQuote && bidsByQuote[q.id]) ? bidsByQuote[q.id].slice() : [];
    bs.sort(function (a, b) { return Number(b.amount) - Number(a.amount); });
    return {
      id: q.id, uid: q.customer_id,
      brand: q.item_brand || '', model: q.item_name || '',
      memo: q.item_detail || '',
      name: '고객',
      photos: (q.photo_urls && q.photo_urls.length) ? q.photo_urls : (q.photo_url ? [q.photo_url] : []),
      photoCount: (q.photo_urls && q.photo_urls.length) || (q.photo_url ? 1 : 0),
      status: q.status, awarded_bid: q.awarded_bid,
      bids: bs, bidAmount: bs[0] ? Number(bs[0].amount) : 0,
      createdAt: tsObj(q.created_at)
    };
  }

  function fetchBidsFor(ids) {
    if (!ids.length) return Promise.resolve({});
    return sb.from('bids').select('*').in('quote_request_id', ids)
      .then(function (res) {
        var by = {};
        (res.data || []).forEach(function (b) { (by[b.quote_request_id] = by[b.quote_request_id] || []).push(b); });
        return by;
      });
  }

  // 비교견적 신청 (고객) — compareForm 에서 호출
  Backend.addListing = function (data) {
    if (!rawUser) return Promise.reject(new Error('NOT_SIGNED_IN'));
    var memo = data.memo || '';
    var contact = '\n[연락처] ' + (data.name || '') + ' / ' + (data.phone || '');
    return uploadPhotos(data.photos, 10).then(function (urls) {
      return sb.from('quote_requests').insert({
        customer_id: rawUser.id,
        item_name: (data.model || data.brand || '시계'),
        item_brand: data.brand || null,
        item_detail: (memo + contact).trim(),
        photo_urls: urls,
        photo_url: urls[0] || null,
        status: 'pending'
      }).then(function (res) { if (res.error) throw res.error; refreshQuoteFeeds(); });
    });
  };

  // 내 비교견적 (고객) — 입찰 포함
  Backend.subscribeMyListings = function (cb) {
    if (!rawUser) { cb([]); return function () {}; }
    var uid = rawUser.id;
    function load() {
      sb.from('quote_requests').select('*').eq('customer_id', uid)
        .order('created_at', { ascending: false })
        .then(function (res) {
          var quotes = res.data || [];
          fetchBidsFor(quotes.map(function (q) { return q.id; })).then(function (by) {
            cb(quotes.map(function (q) { return mapQuote(q, by); }));
          });
        });
    }
    load();
    var unsub = channelRefetch('myquotes', ['quote_requests', 'bids'], load);
    quoteRefreshers.push(load);
    return function () { unsub(); removeFrom(quoteRefreshers, load); };
  };

  // 승인 대기 비교견적 (관리자) — adminPending 에 렌더
  Backend.subscribePending = function (cb) {
    function load() {
      sb.from('quote_requests').select('*').eq('status', 'pending')
        .order('created_at', { ascending: false })
        .then(function (res) {
          var quotes = res.data || [];
          fetchBidsFor(quotes.map(function (q) { return q.id; })).then(function (by) {
            cb(quotes.map(function (q) { return mapQuote(q, by); }));
          });
        });
    }
    load();
    var unsub = channelRefetch('pending', ['quote_requests', 'bids'], load);
    quoteRefreshers.push(load);
    return function () { unsub(); removeFrom(quoteRefreshers, load); };
  };

  // 진행중(open) 비교견적 (승인업체/관리자) — 업체 입찰 화면용
  Backend.subscribeOpenQuotes = function (cb) {
    function load() {
      sb.from('quote_requests').select('*').eq('status', 'open')
        .order('created_at', { ascending: false })
        .then(function (res) {
          var quotes = res.data || [];
          fetchBidsFor(quotes.map(function (q) { return q.id; })).then(function (by) {
            cb(quotes.map(function (q) { return mapQuote(q, by); }));
          });
        });
    }
    load();
    var unsub = channelRefetch('openquotes', ['quote_requests', 'bids'], load);
    quoteRefreshers.push(load);
    return function () { unsub(); removeFrom(quoteRefreshers, load); };
  };

  // 관리자 승인: pending → open
  //  - 승인업체(알림설정 ON)에게는 DB 트리거가 앱알림 생성
  //  - VIP 업체에게는 추가로 카톡 알림톡 발송(Edge Function, best-effort)
  Backend.approveListing = function (id) {
    return sb.from('quote_requests').update({ status: 'open' }).eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        refreshQuoteFeeds();
        notifyVipKakao(id); // 실패해도 승인 흐름엔 영향 없음
      });
  };

  // VIP 업체 카톡 알림톡 발송 요청 (서버에서 대상/내용 재검증)
  function notifyVipKakao(quoteId) {
    try {
      var base = (window.BELLORE_SUPABASE && window.BELLORE_SUPABASE.url) || '';
      var key = (window.BELLORE_SUPABASE && window.BELLORE_SUPABASE.anonKey) || '';
      if (!base) return;
      fetch(base + '/functions/v1/notify-vip-kakao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ quoteId: quoteId })
      }).catch(function () {});
    } catch (e) {}
  }
  // 관리자 거부: → closed
  Backend.rejectListing = function (id) {
    return sb.from('quote_requests').update({ status: 'closed' }).eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshQuoteFeeds(); });
  };

  // 입찰 (관리자/승인업체) — placeBid({id,uid,...}, amount[, message])
  Backend.placeBid = function (listing, amount, message) {
    if (!rawUser) return Promise.reject(new Error('NOT_SIGNED_IN'));
    var row = {
      quote_request_id: listing.id,
      vendor_id: rawUser.id,
      amount: amount,
      message: message || null
    };
    // 동일 업체 재입찰 시 upsert (unique(quote_request_id, vendor_id))
    return sb.from('bids').upsert(row, { onConflict: 'quote_request_id,vendor_id' })
      .then(function (res) { if (res.error) throw res.error; refreshQuoteFeeds(); });
  };

  // 고객 채택: open → awarded (+ 낙찰 업체 알림 시도)
  Backend.awardBid = function (quoteId, bidId, vendorId) {
    return sb.from('quote_requests').update({ status: 'awarded', awarded_bid: bidId }).eq('id', quoteId)
      .then(function (res) {
        if (res.error) throw res.error;
        if (vendorId) {
          Backend.createNotification({ uid: vendorId, type: 'awarded', text: '축하합니다! 입찰하신 비교견적이 채택되었습니다.', refId: quoteId });
        }
        refreshQuoteFeeds();
      });
  };

  // 관리자: 견적 정지 / 해제 / 삭제
  Backend.suspendQuote = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('quote_requests').update({ status: 'suspended' }).eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshQuoteFeeds(); });
  };
  Backend.unsuspendQuote = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('quote_requests').update({ status: 'open' }).eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshQuoteFeeds(); });
  };
  Backend.deleteQuote = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('quote_requests').delete().eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshQuoteFeeds(); });
  };

  // 확정 업체 공개용 — 연락처/주소는 제외하고 상호/로고만 (RLS가 막으면 graceful)
  Backend.getVendorPublic = function (id) {
    if (!id) return Promise.resolve(null);
    return sb.from('profiles').select('id, company_name, display_name, logo_url').eq('id', id).maybeSingle()
      .then(function (res) { return res.data || null; }, function () { return null; });
  };

  var quoteRefreshers = [];
  function refreshQuoteFeeds() { quoteRefreshers.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function removeFrom(arr, fn) { var i = arr.indexOf(fn); if (i !== -1) arr.splice(i, 1); }

  /* ---------------- 판매시계 (listings) ---------------- */
  function mapListing(l) {
    return {
      id: l.id,
      brand: l.title || '',
      model: l.description || '',
      price: l.price || 0,
      sale_price: l.sale_price || null,
      category: l.category || CATS.listing.brand,
      status: l.status,
      tags: l.tags || [],
      condition: l.condition || '',
      pack: l.pack || '',
      size_mm: l.size_mm || null,
      has_warranty: !!l.has_warranty,
      accessories: l.accessories || '',
      stamping: l.stamping || '',
      misu: l.misu || '',
      purchase_year: l.purchase_year || '',
      special_note: l.special_note || '',
      detail_desc: l.detail_desc || '',
      components: l.components || '',
      sale_method: l.sale_method || '',
      product_no: l.product_no || '',
      ship_info: l.ship_info || '',
      created_at: l.created_at || null,
      sale_started_at: l.sale_started_at || null,
      photos: (l.image_urls && l.image_urls.length) ? l.image_urls : (l.image_url ? [l.image_url] : [])
    };
  }
  var listingRefreshers = [];

  function subscribeListings(category, cb) {
    function load() {
      sb.from('listings').select('*').eq('category', category)
        .neq('status', 'hidden')
        .order('created_at', { ascending: false })
        .then(function (res) { cb((res.data || []).map(mapListing)); });
    }
    load();
    listingRefreshers.push(load);
    // listings 는 실시간 publication 대상이 아니므로 변경 시 수동 새로고침
    return function () { removeFrom(listingRefreshers, load); };
  }
  function refreshListingFeeds() { listingRefreshers.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // 벨로르 판매시계
  Backend.subscribeProducts = function (cb) { return subscribeListings(CATS.listing.brand, cb); };
  // 고객 판매 마켓 (검수 완료되어 게시된 매물)
  Backend.subscribeApproved = function (cb) { return subscribeListings(CATS.listing.user, cb); };

  // 신규 컬럼(stamping·misu)이 아직 DB에 없을 때 발생하는 오류 감지
  function isMissingCol(err) {
    var m = (err && (err.message || err.hint || '')) + ' ' + (err && err.code || '');
    return /stamping|misu|purchase_year|special_note|detail_desc|components|sale_method|product_no|ship_info|ref_id|schema cache|PGRST204|find the .* column/i.test(m);
  }
  // 신규 속성 컬럼이 DB에 없을 때 제외하고 재시도하기 위한 목록
  function dropNewCols(o) {
    delete o.stamping; delete o.misu;
    delete o.purchase_year; delete o.special_note; delete o.detail_desc;
    delete o.components; delete o.sale_method;
    delete o.product_no; delete o.ship_info;
  }
  Backend.addProduct = function (data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return uploadPhotos(data.photos || [], 10).then(function (urls) {
      var row = {
        owner_id: rawUser.id,
        title: data.brand,
        description: data.model || null,
        price: data.price || null,
        sale_price: data.sale_price || null,
        category: data.category || CATS.listing.brand,
        status: data.status || 'on_sale',
        tags: data.tags || [],
        condition: data.condition || null,
        sale_started_at: data.sale_started_at || null,
        pack: data.pack || null,
        size_mm: data.size_mm || null,
        has_warranty: !!data.has_warranty,
        accessories: data.accessories || null,
        stamping: data.stamping || null,
        misu: data.misu || null,
        purchase_year: data.purchase_year || null,
        special_note: data.special_note || null,
        detail_desc: data.detail_desc || null,
        components: data.components || null,
        sale_method: data.sale_method || null,
        product_no: data.product_no || null,
        ship_info: data.ship_info || null,
        image_urls: urls,
        image_url: urls[0] || null
      };
      function ins() { return sb.from('listings').insert(row); }
      return ins().then(function (res) {
        if (res.error && isMissingCol(res.error)) {
          dropNewCols(row);   // 컬럼 미생성 시 제외하고 재시도
          return ins();
        }
        return res;
      }).then(function (res) { if (res.error) throw res.error; refreshListingFeeds(); });
    });
  };

  // 단건 조회 (수정 폼용)
  Backend.getListing = function (id) {
    return sb.from('listings').select('*').eq('id', id).single()
      .then(function (res) { if (res.error) throw res.error; return mapListing(res.data); });
  };

  Backend.updateProduct = function (id, data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    // 새로 추가한 사진이 있으면 업로드 후 기존 사진 뒤에 이어붙임
    return uploadPhotos(data.photos || [], 10).then(function (newUrls) {
      var patch = { updated_at: new Date().toISOString() };
      if (data.brand != null) patch.title = data.brand;
      if (data.model != null) patch.description = data.model;
      if (data.price != null) patch.price = data.price;
      if (data.sale_price !== undefined) patch.sale_price = data.sale_price;
      if (data.status != null) patch.status = data.status;
      if (data.category != null) patch.category = data.category;
      if (data.tags != null) patch.tags = data.tags;
      if (data.condition != null) patch.condition = data.condition;
      if (data.sale_started_at !== undefined) patch.sale_started_at = data.sale_started_at;
      if (data.pack != null) patch.pack = data.pack;
      if (data.size_mm != null) patch.size_mm = data.size_mm;
      if (data.has_warranty != null) patch.has_warranty = data.has_warranty;
      if (data.accessories != null) patch.accessories = data.accessories;
      if (data.stamping != null) patch.stamping = data.stamping;
      if (data.misu != null) patch.misu = data.misu;
      if (data.purchase_year != null) patch.purchase_year = data.purchase_year;
      if (data.special_note != null) patch.special_note = data.special_note;
      if (data.detail_desc != null) patch.detail_desc = data.detail_desc;
      if (data.components != null) patch.components = data.components;
      if (data.sale_method != null) patch.sale_method = data.sale_method;
      if (data.product_no != null) patch.product_no = data.product_no;
      if (data.ship_info != null) patch.ship_info = data.ship_info;
      var existing = data.existingPhotos || [];
      if (newUrls.length || data.existingPhotos) {
        var all = existing.concat(newUrls).slice(0, 10);
        patch.image_urls = all;
        patch.image_url = all[0] || null;
      }
      function upd() { return sb.from('listings').update(patch).eq('id', id); }
      return upd().then(function (res) {
        if (res.error && isMissingCol(res.error)) {
          dropNewCols(patch);   // 컬럼 미생성 시 제외하고 재시도
          return upd();
        }
        return res;
      }).then(function (res) { if (res.error) throw res.error; refreshListingFeeds(); });
    });
  };

  Backend.deleteProduct = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('listings').delete().eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshListingFeeds(); });
  };

  /* ---------------- 검색 기록(인기검색어 적립) ---------------- */
  // 검색어를 search_logs에 적재(누구나 insert 가능, RLS로 보호). 실패해도 무시.
  Backend.logSearch = function (q) {
    q = String(q || '').trim(); if (!q) return Promise.resolve();
    return sb.from('search_logs').insert({ q: q, user_id: rawUser ? rawUser.id : null })
      .then(function () {}, function () {});
  };
  // 인기검색어 집계(RPC). 미설치 시 reject → 프런트가 핫 브랜드로 폴백.
  Backend.popularSearches = function (limit) {
    return sb.rpc('popular_searches', { lim: limit || 10 }).then(function (res) {
      if (res.error) throw res.error;
      var list = (res.data || []).map(function (r) { return { q: r.q, cnt: r.cnt }; });
      var total = list.reduce(function (s, r) { return s + (Number(r.cnt) || 0); }, 0);
      return { total: total, list: list };
    });
  };

  /* ---------------- 사이트 콘텐츠(관리자 인앱 편집: 매입 랜딩 · 벨로르 소개) ---------------- */
  Backend.getSiteContent = function (key) {
    return sb.from('site_content').select('*').eq('key', key).maybeSingle()
      .then(function (r) { if (r.error) throw r.error; return r.data || null; });
  };
  Backend.saveSiteContent = function (key, data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return uploadPhotos(data.images || [], 12).then(function (urls) {
      var row = {
        key: key,
        title: (data.title || '').trim(),
        subtitle: (data.subtitle || '').trim(),
        body: (data.body || '').trim(),
        images: urls,
        updated_at: new Date().toISOString()
      };
      return sb.from('site_content').upsert(row, { onConflict: 'key' })
        .then(function (r) { if (r.error) throw r.error; return row; });
    });
  };

  /* ---------------- 업체 승인제 (profiles) ---------------- */
  var vendorRefreshers = [];
  Backend.subscribeVendors = function (cb) {
    function load() {
      sb.from('profiles').select('*').eq('role', 'vendor')
        .order('created_at', { ascending: false })
        .then(function (res) { cb(res.data || []); });
    }
    load();
    vendorRefreshers.push(load);
    return function () { removeFrom(vendorRefreshers, load); };
  };
  function refreshVendors() { vendorRefreshers.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // 전체 회원 목록 (관리자) — email 컬럼은 account migration 후 채워짐
  var accountRefreshers = [];
  Backend.subscribeAccounts = function (cb) {
    function load() {
      sb.from('profiles').select('*').order('created_at', { ascending: false })
        .then(function (res) { cb(res.data || []); });
    }
    load();
    accountRefreshers.push(load);
    return function () { removeFrom(accountRefreshers, load); };
  };
  function refreshAccounts() { accountRefreshers.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  Backend.setVendorApproved = function (id, approved) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('profiles').update({ approved: approved }).eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        if (approved) Backend.createNotification({ uid: id, type: 'approved', text: '업체 승인이 완료되었습니다. 이제 비교견적 입찰에 참여할 수 있어요.' });
        refreshVendors(); refreshAccounts();
      });
  };

  // VIP 업체 지정/해제 (관리자) — VIP 는 새 견적 시 카톡 알림톡까지 발송 대상
  Backend.setVip = function (id, vip) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('profiles').update({ vip: !!vip }).eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        refreshVendors(); refreshAccounts();
      });
  };

  // 관리자: 업체 사용정지 / 해제 (profiles.suspended)
  Backend.setVendorSuspended = function (id, on) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('profiles').update({ suspended: !!on }).eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshVendors(); refreshAccounts(); });
  };
  // 관리자: 업체/회원 프로필 삭제 (auth 계정 완전 삭제는 Supabase 콘솔에서)
  Backend.deleteAccount = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('profiles').delete().eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshVendors(); refreshAccounts(); });
  };
  // 업체 본인: 상호 / 로고 이미지 수정
  Backend.updateMyVendorProfile = function (data) {
    if (!rawUser) return Promise.reject(new Error('NOT_LOGGED_IN'));
    var patch = {};
    if (data.company_name != null) patch.company_name = String(data.company_name).trim();
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url || null;
    if (!Object.keys(patch).length) return Promise.resolve();
    return sb.from('profiles').update(patch).eq('id', rawUser.id)
      .then(function (res) {
        if (res.error) throw res.error;
        return loadProfile().then(notifyAuth, notifyAuth);
      });
  };

  // 본인(업체) 새 견적 앱알림 수신설정 ON/OFF
  Backend.setNotifyQuotes = function (on) {
    if (!rawUser) return Promise.reject(new Error('NOT_SIGNED_IN'));
    return sb.from('profiles').update({ notify_quotes: !!on }).eq('id', rawUser.id)
      .then(function (res) {
        if (res.error) throw res.error;
        return loadProfile().then(notifyAuth, notifyAuth);
      });
  };

  // (호환용) 기존 관리자-관리 인터페이스는 Supabase RLS상 클라이언트에서
  // 이메일로 권한 변경이 불가하므로 안내만 제공합니다.
  Backend.subscribeAdmins = function (cb) { cb([]); return function () {}; };
  Backend.addAdmin = function () { return Promise.reject(new Error('관리자 지정은 Supabase에서 profiles.role=admin 으로 변경하세요.')); };
  Backend.removeAdmin = function () { return Promise.reject(new Error('관리자 해제는 Supabase에서 변경하세요.')); };

  /* ---------------- 커뮤니티/인사이트 (community_posts) ---------------- */
  var postRefreshers = [];
  Backend.subscribePosts = function (cb) {
    function load() {
      sb.from('community_posts').select('*')
        .order('created_at', { ascending: false })
        .then(function (res) { cb(res.data || []); });
    }
    load();
    postRefreshers.push(load);
    return function () { removeFrom(postRefreshers, load); };
  };
  function refreshPosts() { postRefreshers.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // image_url 컬럼이 없는 환경(마이그레이션 전)에서도 안전하게 동작하도록
  // 컬럼 미존재 오류면 image_url 없이 재시도한다.
  function postWrite(run, payloadFull, payloadLite) {
    return run(payloadFull).then(function (res) {
      if (res.error && /image_url|column/.test(res.error.message || '')) return run(payloadLite);
      return res;
    }).then(function (res) { if (res.error) throw res.error; refreshPosts(); });
  }

  Backend.addPost = function (data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return uploadPhotos(data.photos || [], 5).then(function (urls) {
      var lite = { author_id: rawUser.id, title: data.title, body: data.body || null, category: data.category || '자유게시판' };
      var full = Object.assign({}, lite, { image_url: urls[0] || null, image_urls: urls });
      return postWrite(function (p) { return sb.from('community_posts').insert(p); }, full, lite);
    });
  };

  Backend.updatePost = function (id, data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return uploadPhotos(data.photos || [], 5).then(function (urls) {
      var lite = { title: data.title, body: data.body || null, category: data.category || '자유게시판', updated_at: new Date().toISOString() };
      var full = Object.assign({}, lite);
      var all = (data.existingPhotos || []).concat(urls).slice(0, 5);
      full.image_urls = all;
      full.image_url = all[0] || null;
      return postWrite(function (p) { return sb.from('community_posts').update(p).eq('id', id); }, full, lite);
    });
  };

  Backend.deletePost = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('community_posts').delete().eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshPosts(); });
  };

  /* ---------------- 후기 (reviews) ---------------- */
  var reviewRefreshers = [];
  Backend.subscribeReviews = function (cb) {
    function load() {
      sb.from('reviews').select('*').order('created_at', { ascending: false })
        .then(function (res) { cb(res.data || []); });
    }
    load();
    reviewRefreshers.push(load);
    return function () { removeFrom(reviewRefreshers, load); };
  };
  function refreshReviews() { reviewRefreshers.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  Backend.addReview = function (data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return uploadPhotos(data.photos || [], 10).then(function (urls) {
      return sb.from('reviews').insert({
        author_name: data.author_name || '익명',
        rating: data.rating || 5,
        title: data.title,
        body: data.body || null,
        image_urls: urls
      }).then(function (res) { if (res.error) throw res.error; refreshReviews(); });
    });
  };
  Backend.updateReview = function (id, data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    var patch = {
      author_name: data.author_name || '익명',
      rating: data.rating || 5,
      title: data.title, body: data.body || null
    };
    return uploadPhotos(data.photos || [], 10).then(function (urls) {
      if (urls.length || data.existingPhotos) {
        patch.image_urls = (data.existingPhotos || []).concat(urls).slice(0, 10);
      }
      return sb.from('reviews').update(patch).eq('id', id)
        .then(function (res) { if (res.error) throw res.error; refreshReviews(); });
    });
  };

  Backend.deleteReview = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('reviews').delete().eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshReviews(); });
  };

  /* ---------------- 알림 (실시간) ---------------- */
  Backend.subscribeNotifications = function (cb) {
    if (!rawUser) { cb([]); return function () {}; }
    var uid = rawUser.id;
    function load() {
      sb.from('notifications').select('*').eq('user_id', uid)
        .order('created_at', { ascending: false }).limit(50)
        .then(function (res) {
          cb((res.data || []).map(function (n) {
            return {
              id: n.id,
              read: n.is_read,
              text: n.body || n.title || '',
              type: n.type,
              refId: (n.ref_id != null ? String(n.ref_id) : ''),
              createdAt: tsObj(n.created_at)
            };
          }));
        });
    }
    load();
    var unsub = channelRefetch('notif', ['notifications'], load);
    return unsub;
  };

  Backend.markNotificationRead = function (id) {
    return sb.from('notifications').update({ is_read: true }).eq('id', id);
  };

  // RLS상 클라이언트 insert가 막혀 있을 수 있으므로 best-effort.
  // (핵심 알림은 DB 트리거가 security definer로 생성)
  Backend.createNotification = function (data) {
    var base = {
      user_id: data.uid,
      type: data.type || 'info',
      title: data.title || '알림',
      body: data.text || data.body || '',
      is_read: false
    };
    var row = (data.refId != null && data.refId !== '')
      ? Object.assign({ ref_id: data.refId }, base)
      : base;
    return sb.from('notifications').insert(row).then(function (res) {
      // ref_id 컬럼이 아직 없으면(quote_notify.sql 미실행) 제외하고 재시도
      if (res.error && row.ref_id !== undefined && isMissingCol(res.error)) {
        return sb.from('notifications').insert(base);
      }
      return res;
    }).then(function (res) {
      if (res && res.error) console.warn('[BELLORE] 알림 생성 보류:', res.error.message);
    });
  };

  /* ---------------- 주문/결제 (orders) ---------------- */
  function mapOrder(o) {
    return {
      id: o.id,
      orderNo: o.order_no,
      listingId: o.listing_id,
      productName: o.product_name || '',
      productBrand: o.product_brand || '',
      productImage: o.product_image || '',
      productPrice: o.product_price || 0,
      payType: o.pay_type || 'deposit',
      amount: o.amount || 0,
      method: o.method || '',
      status: o.status || 'pending',
      receiptUrl: o.receipt_url || '',
      buyerName: o.buyer_name || '',
      buyerPhone: o.buyer_phone || '',
      createdAt: tsObj(o.created_at),
      paidAt: o.paid_at ? tsObj(o.paid_at) : null
    };
  }

  // 체크아웃: pending 주문 생성 → 토스에 넘길 order_no 반환
  Backend.createOrder = function (data) {
    if (!rawUser) return Promise.reject(new Error('NOT_LOGGED_IN'));
    var orderNo = 'BLR' + Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).slice(2, 6).toUpperCase();
    return sb.from('orders').insert({
      order_no: orderNo,
      customer_id: rawUser.id,
      listing_id: data.listingId || null,
      product_name: data.productName || '상품',
      product_brand: data.productBrand || null,
      product_image: data.productImage || null,
      product_price: data.productPrice || null,
      pay_type: data.payType || 'deposit',
      amount: data.amount,
      coupon_user_id: data.couponUserId || null,
      discount: data.discount || 0,
      buyer_name: data.buyerName || (profile && profile.name) || null,
      buyer_phone: data.buyerPhone || (profile && profile.phone) || null,
      memo: data.memo || null,
      status: 'pending'
    }).select().single().then(function (res) {
      if (res.error) throw res.error;
      return mapOrder(res.data);
    });
  };

  // 결제 승인(검증) — Edge Function 호출. 미배포 시 데모 승인.
  Backend.confirmOrder = function (params) {
    var PAY = window.BELLORE_PAYMENTS || {};
    if (!PAY.confirmUrl) {
      return Promise.resolve({ ok: true, demo: true });
    }
    return fetch(PAY.confirmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CFG.anonKey,
        'apikey': CFG.anonKey
      },
      body: JSON.stringify({
        paymentKey: params.paymentKey,
        orderId: params.orderId,
        amount: params.amount
      })
    }).then(function (r) { return r.json(); });
  };

  Backend.subscribeMyOrders = function (cb) {
    if (!rawUser) { cb([]); return function () {}; }
    var uid = rawUser.id;
    function load() {
      sb.from('orders').select('*').eq('customer_id', uid)
        .order('created_at', { ascending: false })
        .then(function (res) { cb((res.data || []).map(mapOrder)); });
    }
    load();
    var unsub = channelRefetch('orders', ['orders'], load);
    return unsub;
  };

  // 관리자 마이페이지 현황 요약
  Backend.adminSummary = function () {
    function c(q) { return q.then(function (r) { return r.count || 0; }, function () { return 0; }); }
    return Promise.all([
      c(sb.from('quote_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
      c(sb.from('quote_requests').select('*', { count: 'exact', head: true }).eq('status', 'open')),
      c(sb.from('listings').select('*', { count: 'exact', head: true })),
      c(sb.from('community_posts').select('*', { count: 'exact', head: true })),
      c(sb.from('reviews').select('*', { count: 'exact', head: true })),
      c(sb.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'vendor').eq('approved', false))
    ]).then(function (r) {
      return { pending: r[0], open: r[1], listings: r[2], posts: r[3], reviews: r[4], vendorsPending: r[5] };
    });
  };

  // 관리자 대시보드: 오늘 주문/입금/배송 현황
  Backend.adminOrderStats = function () {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var iso = start.toISOString();
    function c(q) { return q.then(function (r) { return r.count || 0; }, function () { return 0; }); }
    return Promise.all([
      c(sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', iso)),
      c(sb.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
      c(sb.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'paid')),
      c(sb.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'preparing')),
      c(sb.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'shipping')),
      sb.from('orders').select('amount').eq('status', 'paid').gte('paid_at', iso)
        .then(function (r) { return (r.data || []).reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0); }, function () { return 0; })
    ]).then(function (r) {
      return { todayOrders: r[0], pendingPay: r[1], paid: r[2], preparing: r[3], shipping: r[4], paidTodayAmount: r[5] };
    });
  };

  /* ---------------- 쿠폰 (coupons / user_coupons) ---------------- */
  function mapCoupon(c) {
    return {
      id: c.id, code: c.code || '', title: c.title || '쿠폰',
      discount_type: c.discount_type || 'amount',
      discount_value: Number(c.discount_value) || 0,
      max_discount: c.max_discount != null ? Number(c.max_discount) : null,
      min_order: Number(c.min_order) || 0,
      apply_to: c.apply_to || 'both',
      downloadable: !!c.downloadable,
      usage_limit: c.usage_limit != null ? Number(c.usage_limit) : null,
      per_user_limit: c.per_user_limit != null ? Number(c.per_user_limit) : 1,
      starts_at: c.starts_at || null, expires_at: c.expires_at || null,
      active: c.active !== false
    };
  }
  function mapUserCoupon(uc) {
    return {
      id: uc.id, couponId: uc.coupon_id, status: uc.status || 'active',
      usedAt: uc.used_at || null, createdAt: uc.created_at || null,
      coupon: uc.coupons ? mapCoupon(uc.coupons) : null
    };
  }
  function couponExpired(c) {
    return !!(c && c.expires_at && new Date(c.expires_at).getTime() < Date.now());
  }
  // 할인액 계산 (정액/정률, 최소금액·상한 반영) — 화면/결제 공용
  function couponDiscount(c, base) {
    base = Number(base) || 0;
    if (!c || base <= 0 || couponExpired(c)) return 0;
    if (c.min_order && base < c.min_order) return 0;
    var d = 0;
    if (c.discount_type === 'percent') {
      d = Math.floor(base * (Number(c.discount_value) || 0) / 100);
      if (c.max_discount) d = Math.min(d, Number(c.max_discount));
    } else {
      d = Number(c.discount_value) || 0;
    }
    return Math.max(0, Math.min(d, base));
  }
  Backend.couponDiscount = couponDiscount;
  function rpcOut(res) { if (res.error) throw res.error; return res.data; }

  // 내 보유 쿠폰 (사용가능/사용완료 모두)
  Backend.myCoupons = function () {
    if (!rawUser) return Promise.resolve([]);
    return sb.from('user_coupons').select('*, coupons(*)').eq('user_id', rawUser.id)
      .order('created_at', { ascending: false })
      .then(function (res) { if (res.error) throw res.error; return (res.data || []).map(mapUserCoupon); });
  };
  // 다운로드 가능한 쿠폰(팝업/이벤트) — 활성·만료 전
  Backend.downloadableCoupons = function () {
    return sb.from('coupons').select('*').eq('downloadable', true).eq('active', true)
      .then(function (res) {
        return (res.data || []).map(mapCoupon).filter(function (c) { return !couponExpired(c); });
      });
  };
  Backend.claimCouponByCode = function (code) { return sb.rpc('claim_coupon_by_code', { p_code: code }).then(rpcOut); };
  Backend.claimCoupon = function (id) { return sb.rpc('claim_coupon', { p_coupon_id: id }).then(rpcOut); };
  Backend.grantCoupon = function (couponId, userId) { return sb.rpc('admin_grant_coupon', { p_coupon_id: couponId, p_user_id: userId }).then(rpcOut); };
  Backend.redeemUserCoupon = function (id, ctx) { return sb.rpc('redeem_user_coupon', { p_user_coupon_id: id, p_context: ctx || 'commission' }).then(rpcOut); };

  // 관리자: 쿠폰 목록/생성/삭제/활성토글
  Backend.listCoupons = function () {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('coupons').select('*').order('created_at', { ascending: false })
      .then(function (res) { if (res.error) throw res.error; return (res.data || []).map(mapCoupon); });
  };
  Backend.createCoupon = function (d) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('coupons').insert({
      code: d.code ? String(d.code).toUpperCase().trim() : null,
      title: d.title, discount_type: d.discountType || 'amount',
      discount_value: d.discountValue || 0, max_discount: d.maxDiscount || null,
      min_order: d.minOrder || 0, apply_to: d.applyTo || 'both',
      downloadable: !!d.downloadable, usage_limit: d.usageLimit || null,
      per_user_limit: d.perUserLimit || 1, expires_at: d.expiresAt || null
    }).select().single().then(function (res) { if (res.error) throw res.error; return mapCoupon(res.data); });
  };
  Backend.deleteCoupon = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('coupons').delete().eq('id', id).then(function (res) { if (res.error) throw res.error; });
  };
  Backend.setCouponActive = function (id, active) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('coupons').update({ active: !!active }).eq('id', id).then(function (res) { if (res.error) throw res.error; });
  };

  /* ---------------- 히어로 배너 (banners) ---------------- */
  function mapBanner(b) {
    return {
      id: b.id,
      title: b.title || '',
      subtitle: b.subtitle || '',
      image: b.image_url || '',
      imageWide: b.image_wide || '',
      imagePc: b.image_pc || '',
      link: b.link || '',
      sort_order: b.sort_order || 0,
      active: b.active !== false
    };
  }
  var bannerRefreshers = [];
  Backend.subscribeBanners = function (cb) {
    function load() {
      sb.from('banners').select('*').eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(10)
        .then(function (res) {
          if (res.error) { console.warn('[BELLORE] banners 로드 실패:', res.error.message); cb([]); return; }
          cb((res.data || []).map(mapBanner));
        });
    }
    load();
    bannerRefreshers.push(load);
    return function () { removeFrom(bannerRefreshers, load); };
  };
  function refreshBanners() { bannerRefreshers.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // 관리자: 전체 배너(비활성 포함) 조회 — 관리 목록용
  Backend.listAllBanners = function () {
    return sb.from('banners').select('*')
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      .then(function (res) { if (res.error) throw res.error; return (res.data || []).map(mapBanner); });
  };

  // 모바일/와이드/PC 3종 이미지를 각각 업로드(없으면 null). 기존 http URL은 그대로 통과.
  function firstUrl(arr) { return uploadPhotos(arr || [], 1).then(function (u) { return u[0] || null; }); }
  function uploadBannerImages(data) {
    return Promise.all([firstUrl(data.photos), firstUrl(data.photosWide), firstUrl(data.photosPc)])
      .then(function (r) { return { mobile: r[0], wide: r[1], pc: r[2] }; });
  }
  // image_wide/image_pc 컬럼이 아직 없는 환경에서도 안전하게(컬럼 미존재면 빼고 재시도)
  function isMissingColErr(err) { return err && /image_wide|image_pc|column/.test(err.message || ''); }
  function stripBannerCols(row) { var c = {}; for (var k in row) { if (k !== 'image_wide' && k !== 'image_pc') c[k] = row[k]; } return c; }
  function bannerWrite(builder, row) {
    return builder(row).then(function (res) {
      if (res.error && isMissingColErr(res.error)) return builder(stripBannerCols(row)).then(function (r2) { if (r2.error) throw r2.error; });
      if (res.error) throw res.error;
    }).then(function () { refreshBanners(); });
  }

  Backend.addBanner = function (data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return uploadBannerImages(data).then(function (img) {
      var row = {
        title: data.title || null,
        subtitle: data.subtitle || null,
        image_url: img.mobile || data.image || null,
        image_wide: img.wide || null,
        image_pc: img.pc || null,
        link: data.link || null,
        sort_order: data.sort_order || 0,
        active: data.active !== false
      };
      return bannerWrite(function (r) { return sb.from('banners').insert(r); }, row);
    });
  };

  Backend.updateBanner = function (id, data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return uploadBannerImages(data).then(function (img) {
      var patch = {};
      if (data.title != null) patch.title = data.title;
      if (data.subtitle != null) patch.subtitle = data.subtitle;
      if (data.link != null) patch.link = data.link;
      if (data.sort_order != null) patch.sort_order = data.sort_order;
      if (data.active != null) patch.active = data.active;
      // 픽커에 기존 URL을 다시 채워 보내므로 항상 명시적으로 갱신(비우면 null=해제)
      patch.image_url = img.mobile || data.image || null;
      patch.image_wide = img.wide || null;
      patch.image_pc = img.pc || null;
      return bannerWrite(function (r) { return sb.from('banners').update(r).eq('id', id); }, patch);
    });
  };

  Backend.deleteBanner = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('banners').delete().eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshBanners(); });
  };

  // 드래그 순서변경 일괄 저장 — ids 배열 순서대로 sort_order = 0,1,2...
  Backend.reorderBanners = function (ids) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    if (!ids || !ids.length) return Promise.resolve();
    return Promise.all(ids.map(function (id, i) {
      return sb.from('banners').update({ sort_order: i }).eq('id', id);
    })).then(function (results) {
      var bad = results.filter(function (r) { return r && r.error; })[0];
      if (bad) throw bad.error;
      refreshBanners();
    });
  };

  /* ---------------- 찜 / 장바구니 (user_picks) — 계정별 ---------------- */
  function mapPick(p) {
    return { id: p.item_key, brand: p.brand || '', model: p.model || '', price: p.price || 0, img: p.image || '' };
  }
  Backend.listPicks = function (kind) {
    if (!rawUser) return Promise.resolve([]);
    return sb.from('user_picks').select('*')
      .eq('user_id', rawUser.id).eq('kind', kind)
      .order('created_at', { ascending: false })
      .then(function (res) { if (res.error) throw res.error; return (res.data || []).map(mapPick); });
  };
  Backend.addPick = function (kind, it) {
    if (!rawUser) return Promise.reject(new Error('NOT_LOGGED_IN'));
    return sb.from('user_picks').upsert({
      user_id: rawUser.id, kind: kind, item_key: String(it.id),
      brand: it.brand || null, model: it.model || null,
      price: it.price || null, image: it.img || null
    }, { onConflict: 'user_id,kind,item_key' })
      .then(function (res) { if (res.error) throw res.error; });
  };
  Backend.removePick = function (kind, key) {
    if (!rawUser) return Promise.resolve();
    return sb.from('user_picks').delete()
      .eq('user_id', rawUser.id).eq('kind', kind).eq('item_key', String(key))
      .then(function (res) { if (res.error) throw res.error; });
  };

  /* ---------------- 부트스트랩 ---------------- */
  Backend.enabled = true;

  var resolveReady;
  Backend.ready = new Promise(function (r) { resolveReady = r; });

  function applySession(session) {
    rawUser = (session && session.user) || null;
    return loadProfile().then(function () {
      mapUser();
      stateKnown = true;
      notifyAuth();
    });
  }

  sb.auth.onAuthStateChange(function (_evt, session) {
    applySession(session);
  });

  sb.auth.getSession().then(function (res) {
    return applySession(res.data ? res.data.session : null);
  }).then(function () {
    resolveReady();
  });
})();
