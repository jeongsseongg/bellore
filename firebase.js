/* ============================================================
   뉴욕워치 · 백엔드 연동 레이어 (Firebase)
   ------------------------------------------------------------
   - firebase-config.js 에 실제 키가 들어오면 자동으로 활성화됩니다.
   - 키가 없으면 NWBackend.enabled = false 로 두고 즉시 종료하여
     기존 데모(로컬) 동작을 그대로 유지합니다.
   - script.js 는 NWBackend.enabled 를 보고 분기합니다.
   ============================================================ */
(function () {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
  var cfg = window.NW_FIREBASE_CONFIG || {};
  var adminEmails = (window.NW_ADMIN_EMAILS || []).map(function (e) {
    return String(e).trim().toLowerCase();
  });

  function isConfigured() {
    return cfg && typeof cfg.apiKey === 'string' &&
      cfg.apiKey.length > 0 && cfg.apiKey.indexOf('PASTE') === -1;
  }

  // 비활성 상태의 기본 객체 (데모로 동작)
  // - configured: 키 설정 여부(동기, 로드 직후 안정적 분기용)
  // - enabled: SDK 로드까지 끝나 실제 사용 가능한지(비동기)
  var Backend = {
    configured: isConfigured(),
    enabled: false,
    ready: Promise.resolve(),
    currentUser: function () { return null; },
    isAdmin: function () { return false; },
    onAuthChange: function () { return function () {}; }
  };
  window.NWBackend = Backend;

  if (!Backend.configured) {
    // 키 미설정 → 데모 모드 유지
    return;
  }

  // 여기서부터는 실제 Firebase 활성 경로
  var fb = {};            // 로드된 SDK 함수 모음
  var authUser = null;    // 현재 로그인 사용자
  var authCbs = [];       // onAuthChange 구독자

  function notifyAuth() {
    var admin = Backend.isAdmin();
    authCbs.forEach(function (cb) {
      try { cb(authUser, { isAdmin: admin }); } catch (e) { /* noop */ }
    });
  }

  Backend.ready = (async function init() {
    try {
      var appMod = await import(SDK + 'firebase-app.js');
      var authMod = await import(SDK + 'firebase-auth.js');
      var fsMod = await import(SDK + 'firebase-firestore.js');
      var stMod = await import(SDK + 'firebase-storage.js');

      var app = appMod.initializeApp(cfg);
      var auth = authMod.getAuth(app);
      var db = fsMod.getFirestore(app);
      var storage = stMod.getStorage(app);

      fb = {
        auth: auth, db: db, storage: storage,
        // auth
        createUser: authMod.createUserWithEmailAndPassword,
        signIn: authMod.signInWithEmailAndPassword,
        signOut: authMod.signOut,
        onAuthStateChanged: authMod.onAuthStateChanged,
        updateProfile: authMod.updateProfile,
        // firestore
        doc: fsMod.doc, setDoc: fsMod.setDoc, addDoc: fsMod.addDoc,
        updateDoc: fsMod.updateDoc, collection: fsMod.collection,
        query: fsMod.query, where: fsMod.where, orderBy: fsMod.orderBy,
        onSnapshot: fsMod.onSnapshot, serverTimestamp: fsMod.serverTimestamp,
        // storage
        sRef: stMod.ref, uploadString: stMod.uploadString,
        getDownloadURL: stMod.getDownloadURL
      };

      Backend.enabled = true;

      fb.onAuthStateChanged(auth, function (user) {
        authUser = user;
        notifyAuth();
      });
    } catch (err) {
      console.error('[NWBackend] 초기화 실패 — 데모 모드로 동작합니다.', err);
      Backend.enabled = false;
    }
  })();

  /* ---------------- 인증 ---------------- */
  Backend.currentUser = function () { return authUser; };

  Backend.isAdmin = function () {
    if (!authUser || !authUser.email) return false;
    return adminEmails.indexOf(authUser.email.toLowerCase()) !== -1;
  };

  Backend.onAuthChange = function (cb) {
    authCbs.push(cb);
    // 이미 상태를 알고 있으면 즉시 1회 통지
    if (Backend.enabled) cb(authUser, { isAdmin: Backend.isAdmin() });
    return function () {
      var i = authCbs.indexOf(cb);
      if (i !== -1) authCbs.splice(i, 1);
    };
  };

  Backend.signUp = async function (data) {
    await Backend.ready;
    var cred = await fb.createUser(fb.auth, data.email, data.password);
    var uid = cred.user.uid;
    if (data.name) {
      try { await fb.updateProfile(cred.user, { displayName: data.name }); } catch (e) {}
    }
    await fb.setDoc(fb.doc(fb.db, 'users', uid), {
      name: data.name || '',
      phone: data.phone || '',
      email: data.email,
      createdAt: fb.serverTimestamp()
    });
    return cred.user;
  };

  Backend.signIn = async function (data) {
    await Backend.ready;
    var cred = await fb.signIn(fb.auth, data.email, data.password);
    return cred.user;
  };

  Backend.signOut = async function () {
    await Backend.ready;
    return fb.signOut(fb.auth);
  };

  /* ---------------- 매물 ---------------- */
  async function uploadPhotos(uid, photos) {
    var urls = [];
    for (var i = 0; i < photos.length; i++) {
      var path = 'listings/' + uid + '/' + Date.now() + '_' + i;
      var ref = fb.sRef(fb.storage, path);
      // photos[i] 는 data URL (FileReader 결과)
      await fb.uploadString(ref, photos[i], 'data_url');
      urls.push(await fb.getDownloadURL(ref));
    }
    return urls;
  }

  Backend.addListing = async function (data) {
    await Backend.ready;
    var user = authUser;
    if (!user) throw new Error('NOT_SIGNED_IN');
    var photoUrls = [];
    try {
      if (data.photos && data.photos.length) {
        photoUrls = await uploadPhotos(user.uid, data.photos);
      }
    } catch (e) {
      console.warn('[NWBackend] 사진 업로드 실패 (메타데이터만 저장):', e);
    }
    var ref = await fb.addDoc(fb.collection(fb.db, 'listings'), {
      uid: user.uid,
      brand: data.brand,
      model: data.model,
      memo: data.memo || '',
      name: data.name || user.displayName || '',
      phone: data.phone || '',
      photos: photoUrls,
      photoCount: data.photoCount || photoUrls.length,
      status: 'pending',
      createdAt: fb.serverTimestamp()
    });
    return ref.id;
  };

  function snap(qy, cb) {
    return fb.onSnapshot(qy, function (qs) {
      var rows = [];
      qs.forEach(function (d) {
        var v = d.data();
        v.id = d.id;
        rows.push(v);
      });
      cb(rows);
    }, function (err) {
      console.warn('[NWBackend] 구독 오류:', err);
    });
  }

  Backend.subscribeMyListings = function (cb) {
    if (!authUser) { cb([]); return function () {}; }
    var qy = fb.query(
      fb.collection(fb.db, 'listings'),
      fb.where('uid', '==', authUser.uid)
    );
    return snap(qy, function (rows) {
      rows.sort(function (a, b) { return tsMs(b.createdAt) - tsMs(a.createdAt); });
      cb(rows);
    });
  };

  Backend.subscribePending = function (cb) {
    var qy = fb.query(
      fb.collection(fb.db, 'listings'),
      fb.where('status', '==', 'pending')
    );
    return snap(qy, function (rows) {
      rows.sort(function (a, b) { return tsMs(b.createdAt) - tsMs(a.createdAt); });
      cb(rows);
    });
  };

  Backend.subscribeApproved = function (cb) {
    var qy = fb.query(
      fb.collection(fb.db, 'listings'),
      fb.where('status', '==', 'approved')
    );
    return snap(qy, function (rows) {
      rows.sort(function (a, b) { return tsMs(b.createdAt) - tsMs(a.createdAt); });
      cb(rows);
    });
  };

  Backend.approveListing = async function (id) {
    await Backend.ready;
    return fb.updateDoc(fb.doc(fb.db, 'listings', id), {
      status: 'approved', approvedAt: fb.serverTimestamp()
    });
  };

  Backend.rejectListing = async function (id) {
    await Backend.ready;
    return fb.updateDoc(fb.doc(fb.db, 'listings', id), {
      status: 'rejected', rejectedAt: fb.serverTimestamp()
    });
  };

  function tsMs(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    return 0;
  }
})();
