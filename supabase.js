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
    onAuthChange: function () { return function () {}; }
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
            if (res.error) { console.warn('[BELLORE] 사진 업로드 실패:', res.error.message); return; }
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
  Backend.isAdmin = function () {
    if (profile && profile.role === 'admin') return true;
    return !!(authUser && authUser.email && adminEmails.indexOf(authUser.email.toLowerCase()) !== -1);
  };
  Backend.isVendor = function () { return Backend.role() === 'vendor'; };
  Backend.isApprovedVendor = function () { return Backend.isVendor() && !!(profile && profile.approved); };

  function authInfo() {
    return {
      isAdmin: Backend.isAdmin(),
      role: Backend.role(),
      approved: !!(profile && profile.approved),
      isApprovedVendor: Backend.isApprovedVendor()
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
    return sb.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          display_name: data.name || '',
          role: role,
          company_name: data.company || null,
          phone: data.phone || null
        }
      }
    }).then(function (res) {
      if (res.error) throw res.error;
      // 휴대폰 번호는 트리거가 채우지 않으므로 세션이 있으면 보강
      if (res.data && res.data.session && data.phone) {
        sb.from('profiles').update({ phone: data.phone })
          .eq('id', res.data.user.id).then(function () {}, function () {});
      }
      return res.data.user;
    });
  };

  Backend.signIn = function (data) {
    return sb.auth.signInWithPassword({ email: data.email, password: data.password })
      .then(function (res) {
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
      options: { redirectTo: location.origin + location.pathname }
    }).then(function (res) {
      if (res.error) throw res.error;
      return { displayName: '' };
    });
  };

  Backend.signOut = function () { return sb.auth.signOut(); };

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

  // 관리자 승인: pending → open (승인된 업체에게 입찰 개방, 트리거가 알림)
  Backend.approveListing = function (id) {
    return sb.from('quote_requests').update({ status: 'open' }).eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshQuoteFeeds(); });
  };
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
          Backend.createNotification({ uid: vendorId, type: 'awarded', text: '축하합니다! 입찰하신 비교견적이 채택되었습니다.' });
        }
        refreshQuoteFeeds();
      });
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
      category: l.category || CATS.listing.brand,
      status: l.status,
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

  Backend.addProduct = function (data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return uploadPhotos(data.photos || [], 10).then(function (urls) {
      return sb.from('listings').insert({
        owner_id: rawUser.id,
        title: data.brand,
        description: data.model || null,
        price: data.price || null,
        category: data.category || CATS.listing.brand,
        status: 'on_sale',
        image_urls: urls,
        image_url: urls[0] || null
      }).then(function (res) { if (res.error) throw res.error; refreshListingFeeds(); });
    });
  };

  Backend.updateProduct = function (id, data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    var patch = { updated_at: new Date().toISOString() };
    if (data.brand != null) patch.title = data.brand;
    if (data.model != null) patch.description = data.model;
    if (data.price != null) patch.price = data.price;
    if (data.status != null) patch.status = data.status;
    return sb.from('listings').update(patch).eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshListingFeeds(); });
  };

  Backend.deleteProduct = function (id) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('listings').delete().eq('id', id)
      .then(function (res) { if (res.error) throw res.error; refreshListingFeeds(); });
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

  Backend.setVendorApproved = function (id, approved) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('profiles').update({ approved: approved }).eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        if (approved) Backend.createNotification({ uid: id, type: 'approved', text: '업체 승인이 완료되었습니다. 이제 비교견적 입찰에 참여할 수 있어요.' });
        refreshVendors();
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

  Backend.addPost = function (data) {
    if (!Backend.isAdmin()) return Promise.reject(new Error('NOT_ADMIN'));
    return sb.from('community_posts').insert({
      author_id: rawUser.id,
      title: data.title,
      body: data.body || null,
      category: data.category || '자유게시판'
    }).then(function (res) { if (res.error) throw res.error; refreshPosts(); });
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
    return sb.from('notifications').insert({
      user_id: data.uid,
      type: data.type || 'info',
      title: data.title || '알림',
      body: data.text || data.body || '',
      is_read: false
    }).then(function (res) { if (res.error) console.warn('[BELLORE] 알림 생성 보류:', res.error.message); });
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
