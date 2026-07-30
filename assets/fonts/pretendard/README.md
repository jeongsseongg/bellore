# Pretendard 웹 폰트

벨로르 웹 UI의 공식 기본 글꼴은 Pretendard다.

## 포함 파일

- `PretendardVariable.woff2`: 웹 배포용 가변 폰트
- `LICENSE.txt`: SIL Open Font License 1.1

전체 OTF·TTF·정적 WOFF/WOFF2 패키지 원본은
`design-refs/00-design-system/Pretendard-original.zip`에 보관한다.

## CSS 사용 기준

```css
@font-face {
  font-family: "Pretendard";
  src: url("./assets/fonts/pretendard/PretendardVariable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

html,
body,
button,
input,
select,
textarea {
  font-family: "Pretendard", -apple-system, BlinkMacSystemFont,
    "Apple SD Gothic Neo", sans-serif;
}
```

- 본문과 UI 숫자까지 Pretendard로 통일한다.
- 숫자 열 정렬이 필요한 곳은 `font-variant-numeric: tabular-nums`를 사용한다.
- BELLORE 워드마크·로고만 별도 서체를 허용한다.
