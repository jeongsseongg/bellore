export const MARKET_CSS = `
:root{--ink:#151a18;--muted:#6d746f;--line:#e6e9e6;--paper:#fff;--wash:#f4f6f4;--green:#12372c;--gold:#aa8748}
*{box-sizing:border-box}
html{background:var(--wash);color:var(--ink);font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-font-smoothing:antialiased}
body{margin:0;background:var(--paper);line-height:1.65}
img{display:block;max-width:100%}
a{color:inherit}
.site-header{position:sticky;top:0;z-index:5;border-bottom:1px solid var(--line);background:rgba(255,255,255,.96);backdrop-filter:blur(12px)}
.site-header__inner,.page,.site-footer__inner{width:min(1120px,calc(100% - 40px));margin:0 auto}
.site-header__inner{height:68px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.wordmark{font-size:19px;font-weight:850;letter-spacing:.16em;text-decoration:none;color:var(--green)}
.site-nav{display:flex;gap:20px;font-size:14px}
.site-nav a{text-decoration:none;color:var(--muted)}
.page{padding:26px 0 80px}
.crumbs{margin:0 0 22px;color:var(--muted);font-size:13px}
.crumbs a{text-decoration:none}
.eyebrow{margin:0 0 8px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.12em}
h1{margin:0;font-size:clamp(28px,5vw,48px);line-height:1.18;letter-spacing:-.035em}
.lead{margin:12px 0 0;color:var(--muted);font-size:16px}
.market-head{padding:24px 0 34px;border-bottom:1px solid var(--line)}
.product-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:30px 18px;padding:32px 0}
.product-card{position:relative;min-width:0;text-decoration:none}
.product-card__image{aspect-ratio:1/1.16;width:100%;object-fit:cover;background:var(--wash);border-radius:14px}
.product-card__status{position:absolute;top:10px;right:10px;display:inline-flex;align-items:center;min-height:28px;padding:4px 10px;border-radius:999px;background:rgba(18,55,44,.94);color:#fff;font-size:12px;font-weight:850;letter-spacing:.01em}
.product-card__status.is-sold{background:rgba(21,26,24,.92)}
.product-card__status[hidden]{display:none}
.product-card__brand{margin:11px 0 2px;color:var(--muted);font-size:12px;font-weight:700}
.product-card__name{margin:0;font-size:15px;line-height:1.45;font-weight:750}
.product-card__reference,.product-card__meta{margin:4px 0 0;font-size:12px;line-height:1.4;color:var(--muted)}
.product-card__price{margin:4px 0 0;font-size:16px;font-weight:850}
.product-layout{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(360px,.98fr);gap:48px;align-items:start}
.hero-wrap{position:sticky;top:96px;background:var(--wash);border-radius:18px;overflow:hidden}
.hero{width:100%;aspect-ratio:1/1.08;object-fit:cover}
.product-summary{padding-top:12px}
.badges{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px}
.badge{display:inline-flex;align-items:center;min-height:28px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:12px;font-weight:750}
.badge.is-reserved{border-color:#d8c298;color:#806026;background:#fffaf0}
.badge.is-sold{border-color:#2b302d;color:#fff;background:#2b302d}
.badge--vintage{border-color:#d8c298;color:#806026;background:#fffaf0}
.product-code{margin:12px 0 0;color:var(--muted);font-size:13px}
.price{margin:22px 0 4px;font-size:32px;font-weight:900;letter-spacing:-.035em}
.price__old{margin-right:10px;color:#a3a8a5;font-size:16px;font-weight:500;text-decoration:line-through}
.cta{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin:24px 0 0;border-radius:10px;background:var(--green);color:#fff;text-decoration:none;font-weight:800}
.section{padding:32px 0;border-top:1px solid var(--line)}
.section:first-of-type{margin-top:32px}
.section h2{margin:0 0 17px;font-size:20px;letter-spacing:-.025em}
.spec{margin:0}
.spec__row{display:grid;grid-template-columns:140px 1fr;gap:18px;padding:11px 0;border-bottom:1px solid var(--line)}
.spec__row:last-child{border-bottom:0}
.spec dt{color:var(--muted);font-size:14px}
.spec dd{margin:0;font-size:14px;word-break:keep-all}
.condition-list{margin:0;padding:0;list-style:none}
.condition-list li{position:relative;margin:10px 0;padding-left:16px;color:#454c47}
.condition-list li:before{position:absolute;left:0;top:.7em;width:5px;height:5px;border-radius:50%;background:var(--gold);content:""}
.detail-gallery{display:grid;gap:18px}
.detail-gallery img{width:100%;height:auto;border-radius:14px;background:var(--wash)}
.back-link{display:inline-flex;margin-top:26px;color:var(--green);font-weight:750;text-decoration:none}
.site-footer{border-top:1px solid var(--line);background:var(--wash)}
.site-footer__inner{padding:32px 0 48px;color:var(--muted);font-size:13px}
.site-footer strong{color:var(--green)}
@media(max-width:900px){.product-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.product-layout{grid-template-columns:1fr;gap:28px}.hero-wrap{position:static}.product-summary{padding-top:0}}
@media(max-width:620px){.site-header__inner,.page,.site-footer__inner{width:min(100% - 28px,1120px)}.site-nav{gap:12px;font-size:13px}.site-nav a:first-child{display:none}.page{padding-top:18px}.product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 12px}.product-card__name{font-size:14px}.product-card__meta{display:block}.product-layout{gap:22px}.hero-wrap{margin:0 -14px;border-radius:0}.spec__row{grid-template-columns:104px 1fr;gap:12px}.section{padding:26px 0}}
`;
