/* ============================================================
   뉴욕워치 · Firebase 설정 (데이터 동기화용)
   ============================================================

   ▶ 이 파일만 채우면 웹·앱·모든 기기에서 회원/매물 데이터가
     자동으로 동기화됩니다. 키를 넣기 전까지는 사이트가
     기존 데모(로컬) 방식 그대로 동작합니다.

   ── 설정 방법 (5분) ───────────────────────────────────────
   1) https://console.firebase.google.com 접속 → "프로젝트 추가"
      (구글 계정 필요, 무료 Spark 요금제로 충분)
   2) 프로젝트 안에서 좌측 "빌드" 메뉴로 이동하여 켜기:
        - Authentication → "시작하기" → 로그인 방법에서
          "이메일/비밀번호" 사용 설정
        - Firestore Database → "데이터베이스 만들기"
          (위치는 asia-northeast3(서울) 권장, "프로덕션 모드")
        - Storage → "시작하기"  (매물 사진 업로드용)
   3) 프로젝트 설정(⚙️) → "내 앱" → 웹 앱(</>) 추가 →
      표시되는 firebaseConfig 값을 아래에 그대로 붙여넣기
   4) 관리자로 쓸 이메일을 NW_ADMIN_EMAILS 에 추가하고,
      그 이메일로 사이트에서 회원가입 하면 관리자 모드가 켜집니다.
   5) (중요) 아래 "보안 규칙" 주석을 Firestore/Storage 규칙에
      복사해 붙여넣어 데이터를 보호하세요.
   ──────────────────────────────────────────────────────────
*/

/* 2단계에서 복사한 값으로 교체하세요. (apiKey 에 'PASTE' 가
   남아 있으면 백엔드가 꺼진 것으로 간주하고 데모로 동작합니다.) */
window.NW_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCDQU0W4HHJ2HD1_tGXa753_BdBwQjwBek",
  authDomain: "newyork-watch.firebaseapp.com",
  projectId: "newyork-watch",
  storageBucket: "newyork-watch.firebasestorage.app",
  messagingSenderId: "960228838979",
  appId: "1:960228838979:web:811290a14db762ac704ef6",
  measurementId: "G-MPKFN1GKS9"
};

/* 관리자 권한을 줄 이메일 목록 (이 계정으로 로그인하면 관리자 모드) */
window.NW_ADMIN_EMAILS = [
  "jeongsseongg@gmail.com"
];

/* ── 보안 규칙은 별도 파일로 관리합니다 ───────────────────────
   - Firestore 규칙: firestore.rules
   - Storage 규칙:   storage.rules
   배포 방법(둘 중 하나):
     (a) 콘솔에 복사: 각 파일 내용을 Firestore "규칙" / Storage "규칙"
         탭에 붙여넣고 "게시"
     (b) CLI: `firebase deploy --only firestore:rules,storage`
   ────────────────────────────────────────────────────────── */
