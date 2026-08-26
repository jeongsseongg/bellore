const paths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/>',
  order: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  quote: '<path d="M4 5.5h16v11H8l-4 3v-14Z"/><path d="M8 10h8M8 13h5"/>',
  consign: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M8 8a4 4 0 0 1 8 0"/>',
  return: '<path d="M9 7H5v-4"/><path d="M5 7c1.8-2.4 4.2-3.5 7-3.5A8.5 8.5 0 1 1 4 15"/><path d="m4 15 3-1.5"/>',
  watch: '<circle cx="12" cy="12" r="6"/><path d="M9 6V2h6v4M9 18v4h6v-4M12 8v4l2.5 2"/>',
  auction: '<path d="m5 11 6-6 3 3-6 6-3-3Z"/><path d="m12 6 2-2 4 4-2 2M8 13l-2 2M11 18h9M16 15v3"/>',
  inspect: '<path d="M4 5h16v14H4z"/><path d="m8 11 2.5 2.5L16 8M8 2v3M16 2v3"/>',
  customer: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21c.8-5 3.2-7 7-7s6.2 2 7 7"/>',
  vendor: '<path d="M4 9h16v11H4z"/><path d="m3 9 2-5h14l2 5M8 13v7M16 13v7M8 9V4M16 9V4"/>',
  partner: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 5V3h8v2M3 11h18M10 11v2h4v-2"/>',
  settlement: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h3"/>',
  coupon: '<path d="M4 7a2 2 0 0 0 0 4v6h16v-6a2 2 0 0 0 0-4V5H4v2Z"/><path d="M12 5v12"/>',
  support: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>',
  banner: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 5-4 3 2 2-2 4 4"/>',
  ai: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  notification: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>',
  audit: '<path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  shield: '<path d="M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  dots: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  truck: '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  bank: '<path d="m3 9 9-5 9 5M5 10h14M6 18h12M4 21h16M8 10v8M12 10v8M16 10v8"/>',
  building: '<path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M17 13h1M17 17h1"/>'
};

export function icon(name, className = '') {
  const body = paths[name] || paths.dots;
  return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
