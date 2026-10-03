/* Иллюстрации макетов «видения»: портреты героев, человечки, выпечка, сцена точки, HUD этапа.
   Стиль — плоская заливка + тонкий контур чернилами, как линии «генплана». */
(function () {
  const INK = '#2a2320';
  const SK = '#efc9a4', SK2 = '#dca77f';
  let uid = 0;

  /* ---------- Доп. иконки (24×24, stroke = currentColor) ---------- */
  Object.assign(IC, {
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 4l9 5.5zM5 10v7M9.7 10v7M14.3 10v7M19 10v7M3 20h18"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
    cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 3.5c-.6 1 .6 1.8 0 2.8M12 3.5c-.6 1 .6 1.8 0 2.8"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.8 6.2 6.2 1.8-6.2 1.8L12 18.5l-1.8-6.2L4 10.5l6.2-1.8z"/><circle cx="19" cy="18.5" r="1.6"/></svg>',
    wheat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V8"/><path d="M12 8c-2.4-.4-3.6-2-3.6-4.4 2.4.3 3.6 1.9 3.6 4.4zM12 8c2.4-.4 3.6-2 3.6-4.4-2.4.3-3.6 1.9-3.6 4.4zM12 13c-2.6-.3-4-2-4-4.4 2.6.3 4 1.9 4 4.4zM12 13c2.6-.3 4-2 4-4.4-2.6.3-4 1.9-4 4.4zM12 18c-2.6-.3-4-2-4-4.4 2.6.3 4 1.9 4 4.4zM12 18c2.6-.3 4-2 4-4.4-2.6.3-4 1.9-4 4.4z"/></svg>',
    mill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21l1.5-9h5L16 21zM12 12L5 5M12 12l7-7M12 12L5 19M12 12l7 7"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.5l2.2 11h10.6L20.5 7H6.6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
    handshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 11l4-4 3 1.5L12 7l3.5 1.5L18 7l3.5 4"/><path d="M6.5 13.5l3 3c.6.6 1.5.6 2 0l.5-.5M9 11l3.5 3.5c.6.6 1.5.6 2 0l2.5-2.5M12.5 9.5l4.5 4"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 18h16l1-10-5 4-4-6-4 6-5-4z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v3M8 20h8M9.5 17h5"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5c3-1 5.5-1 8 1 2.5-2 5-2 8-1v14c-3-1-5.5-1-8 1-2.5-2-5-2-8-1z"/><path d="M12 6v14"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2 2M14 9l1.8 1.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  });

  /* ---------- Портреты героев ---------- */
  const eyes = (o) => o === 'happy'
    ? `<path d="M26.1,31 Q27.6,29.2 29.1,31 M34.9,31 Q36.4,29.2 37.9,31" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
    : `<circle cx="27.6" cy="30.6" r="1.45" fill="${INK}"/><circle cx="36.4" cy="30.6" r="1.45" fill="${INK}"/>`;
  const cheeks = '<circle cx="25" cy="35" r="2.3" fill="#e8806c" opacity=".28"/><circle cx="39" cy="35" r="2.3" fill="#e8806c" opacity=".28"/>';
  const nose = `<path d="M32.2,31.4 Q33.6,34.2 31.7,34.8" stroke="${SK2}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  const brows = (c, w) => `<path d="M25.2,26.8 Q27.6,25.4 29.9,26.5 M34.1,26.5 Q36.4,25.4 38.8,26.8" stroke="${c || INK}" stroke-width="${w || 1.3}" fill="none" stroke-linecap="round"/>`;
  const smile = `<path d="M28.9,37.2 Q32,39.9 35.1,37.2" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  const body = (c) => `<path d="M5,68 C6,53 16.5,46.8 32,46.8 C47.5,46.8 58,53 59,68 Z" fill="${c}" stroke="${INK}" stroke-width="1.2"/>`;
  const neck = `<path d="M27.6,38 h8.8 v10 q-4.4,3 -8.8,0z" fill="${SK2}"/>`;
  const head = (rx) => `<circle cx="${32 - (rx || 11.6) - .4}" cy="31.5" r="2.5" fill="${SK}" stroke="${INK}" stroke-width="1"/><circle cx="${32 + (rx || 11.6) + .4}" cy="31.5" r="2.5" fill="${SK}" stroke="${INK}" stroke-width="1"/><ellipse cx="32" cy="30.5" rx="${rx || 11.6}" ry="13" fill="${SK}" stroke="${INK}" stroke-width="1.2"/>`;
  const dots = (pts, c, r) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r || .9}" fill="${c}"/>`).join('');

  const H = {
    hero: { bg: 'var(--crust-soft)', name: 'Азат', draw: () =>
      body('#f4efe6') + `<path d="M20.5,51 L43.5,51 L47,68 L17,68Z" fill="var(--crust)" stroke="${INK}" stroke-width="1.1"/><path d="M23,51 L26.5,47.2 M41,51 L37.5,47.2" stroke="${INK}" stroke-width="1.1"/>` + neck + head() +
      `<path d="M20.2,29 C19.4,18.6 24.5,15.2 32,15.2 C39.8,15.2 44.8,19.4 43.8,29 C42.9,24.5 40.6,22 37.6,21.4 C35,23.2 30,23.5 26.4,22.2 C23.6,23.1 21.3,25.4 20.2,29 Z" fill="#3a2a20" stroke="${INK}" stroke-width="1"/>` +
      eyes() + brows() + nose + cheeks + smile },
    rashid: { bg: '#e8dcc6', name: 'Рашид', draw: () =>
      body('#f6f3ec') + `<path d="M21,52 L43,52 L46,68 L18,68Z" fill="#6b4a2e" stroke="${INK}" stroke-width="1.1"/>` + neck + head(12.2) +
      `<path d="M19.9,31.5 C19.4,26 20.4,23.4 22.3,22.4 L22.9,30.5Z M44.1,31.5 C44.6,26 43.6,23.4 41.7,22.4 L41.1,30.5Z" fill="#c9c2b8" stroke="${INK}" stroke-width=".8"/>` +
      `<path d="M20.4,24.2 C20.6,14.6 43.4,14.6 43.6,24.2 C38,22.4 26,22.4 20.4,24.2Z" fill="#2f5d4a" stroke="${INK}" stroke-width="1.1"/>` + dots([[23.5, 21.6], [27.5, 20.8], [32, 20.6], [36.5, 20.8], [40.5, 21.6]], '#e2b24a', .95) +
      `<path d="M24.8,26.3 L29.8,27.5 M34.2,27.5 L39.2,26.3" stroke="#8b847b" stroke-width="2.2" stroke-linecap="round"/>` + eyes() + nose +
      `<path d="M26.4,36 C28.5,33.4 31.2,34 32,34.9 C32.8,34 35.5,33.4 37.6,36 C35.4,36.9 33.2,36.6 32,35.8 C30.8,36.6 28.6,36.9 26.4,36Z" fill="#d6d0c6" stroke="${INK}" stroke-width=".9"/>` +
      `<path d="M30,39.2 L34,39.2" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/><path d="M24.6,33 q1,2.6 0,4.6 M39.4,33 q-1,2.6 0,4.6" stroke="${SK2}" stroke-width="1" fill="none"/>` },
    gulya: { bg: '#f5d9d1', name: 'Гуля', draw: () =>
      body('#f9f7f2') + `<path d="M32,47 L32,68" stroke="${INK}" stroke-width="1"/>` + dots([[28.5, 53], [28.5, 59], [35.5, 53], [35.5, 59]], INK, .9) + neck + head(11.2) +
      `<path d="M20.6,29 C21,25.4 23,23.6 25,23.2 L23.4,30Z" fill="#2a1d17"/>` +
      `<path d="M19.6,28.4 C18.8,16.8 25,13.4 32,13.4 C39.6,13.4 45.2,16.8 44.4,28.4 C42.2,23.4 37.8,21.3 32,21.3 C26.2,21.3 21.8,23.4 19.6,28.4Z" fill="#c0412d" stroke="${INK}" stroke-width="1.1"/>` +
      dots([[25, 18.5], [30, 16.2], [35.5, 16.4], [40, 19], [27.5, 20.6], [38, 21.5]], '#fff', .9) +
      `<path d="M43.4,21.6 l6.2,-3.4 l-1.2,5.2z M43.6,23.8 l6.4,1.2 l-3,3.8z" fill="#c0412d" stroke="${INK}" stroke-width="1"/>` +
      eyes() + brows() + nose + cheeks + `<path d="M28.4,36.6 Q32,41.4 35.6,36.6 Z" fill="#7a2e22" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="39.6" cy="32.4" rx="2" ry="1" fill="#fff" opacity=".85"/>` },
    oleg: { bg: 'var(--rival-soft)', name: 'Олег', draw: () =>
      body('#5b6270') + `<path d="M26.8,47 L32,57 L37.2,47Z" fill="#eef0f3" stroke="${INK}" stroke-width="1"/><path d="M26.8,47 L24,58 L31,68 M37.2,47 L40,58 L33,68" stroke="#3d434f" stroke-width="1.3" fill="none"/>` + neck + head(11.4) +
      `<path d="M21.4,33 C22.4,40.4 27,43.4 32,43.4 C37,43.4 41.6,40.4 42.6,33 C41,37.8 37,39.8 32,39.8 C27,39.8 23,37.8 21.4,33Z" fill="#6b6660" opacity=".22"/>` +
      `<path d="M20.4,28 C19.8,18.4 25,14.8 32.5,14.8 C40,14.8 44.6,18.8 43.6,27.6 C42.5,23 40.4,21.2 37.8,20.6 C33,21.4 27,20.2 24,21.8 C22.2,23.4 21,25.2 20.4,28Z" fill="#7a746c" stroke="${INK}" stroke-width="1"/><path d="M27,15.8 Q26,18.6 24,21.8" stroke="#a8a29a" stroke-width="1" fill="none"/>` +
      eyes() + `<path d="M25.2,27 Q27.6,26 29.9,26.8 M34.1,25.7 Q36.6,24 38.9,25.3" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` + nose + `<path d="M29,37.8 Q33,38.9 35.8,36.3" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` },
    elvira: { bg: 'var(--river-soft)', name: 'Эльвира', draw: () =>
      `<path d="M18.8,31 C17.8,17 24,13.2 32,13.2 C40,13.2 46.2,17 45.2,31 L45.6,41.4 C43.2,42.8 41.6,42.2 41,40.4 L23,40.4 C22.4,42.2 20.8,42.8 18.4,41.4 Z" fill="#1d1a22" stroke="${INK}" stroke-width="1"/>` +
      body('#26344f') + `<path d="M27.4,47 L32,55 L36.6,47Z" fill="#f4f2ee"/><path d="M27.4,47 L25,58 L30.5,68 M36.6,47 L39,58 L33.5,68" stroke="#141c2e" stroke-width="1.3" fill="none"/>` + neck + head(11) +
      `<path d="M20.6,27.6 C20.6,18.4 26,15 32.8,15 C39.6,15 43.6,18.8 43.4,27 C40.6,23.4 36,21.4 31,22.4 C27,23.1 23,24.8 20.6,27.6Z" fill="#1d1a22"/>` +
      `<circle cx="20.9" cy="36" r="1.1" fill="#e2b24a"/><circle cx="43.1" cy="36" r="1.1" fill="#e2b24a"/>` + eyes() + brows() + nose + `<path d="M29.4,37.6 Q32,38.8 34.6,37.6" stroke="#a5483c" stroke-width="1.6" fill="none" stroke-linecap="round"/>` },
    sania: { bg: 'var(--good-soft)', name: 'Бабушка Сания', draw: () =>
      `<path d="M17.4,34 C16.4,18 23,11.4 32,11.4 C41,11.4 47.6,18 46.6,34 C46,40.4 42,44.6 36,45.6 L28,45.6 C22,44.6 18,40.4 17.4,34Z" fill="#2c7a58" stroke="${INK}" stroke-width="1.1"/>` +
      body('#8a5a44') + `<path d="M32,47 V68" stroke="#5e3b2c" stroke-width="1.2"/>` + head(10.8) +
      `<path d="M20.4,27.4 C21,19.2 25.6,16.2 32,16.2 C38.4,16.2 43,19.2 43.6,27.4 C41.2,23.2 37,21.6 32,21.6 C27,21.6 22.8,23.2 20.4,27.4Z" fill="#2c7a58" stroke="${INK}" stroke-width="1"/>` +
      dots([[24, 17], [29, 14], [35, 14], [40, 17], [44, 24], [20, 24], [26, 19.6], [38, 19.6], [19.5, 34], [44.5, 34]], '#f3d36b', 1.05) +
      `<path d="M28.6,44.6 l3.4,5.4 l3.4,-5.4z" fill="#236047" stroke="${INK}" stroke-width="1"/>` +
      eyes('happy') + `<path d="M23.8,30.4 l-1.6,-.8 M23.8,31.8 l-1.6,.4 M40.2,30.4 l1.6,-.8 M40.2,31.8 l1.6,.4" stroke="${SK2}" stroke-width="1"/>` + brows('#9a9088') + nose + cheeks + `<path d="M28.2,36.8 Q32,40.8 35.8,36.8" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` },
    semyon: { bg: '#efe3cf', name: 'Семён Аркадьевич', draw: () =>
      body('#7a6a58') + `<path d="M24,47.6 C28,52 36,52 40,47.6 L41,51 C36,55 28,55 23,51Z" fill="#c0412d" stroke="${INK}" stroke-width="1"/>` + neck + head(11.4) +
      `<path d="M21.2,32 C21.6,41.4 26.4,45.4 32,45.4 C37.6,45.4 42.4,41.4 42.8,32 C41,36.2 38,38.2 32,38.4 C26,38.2 23,36.2 21.2,32Z" fill="#d8d4cd" stroke="${INK}" stroke-width="1"/>` +
      `<path d="M19.6,24.2 C19.8,15.4 44.2,15.4 44.4,24.2 L47.4,25.8 C40,23.6 26,23.2 19.6,24.2Z" fill="#6b4a2e" stroke="${INK}" stroke-width="1.1"/>` +
      eyes() + `<circle cx="27.6" cy="30.6" r="3.4" fill="none" stroke="${INK}" stroke-width="1.1"/><circle cx="36.4" cy="30.6" r="3.4" fill="none" stroke="${INK}" stroke-width="1.1"/><path d="M31,30.4 h2" stroke="${INK}" stroke-width="1.1"/>` + brows('#9a9088', 1.5) + `<path d="M29.6,38.6 Q32,39.8 34.4,38.6" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` },
    mama: { bg: '#d9e8ea', name: 'Мама', draw: () =>
      `<circle cx="32" cy="14.4" r="5.2" fill="#6a4632" stroke="${INK}" stroke-width="1"/>` + body('#3b8796') + neck + head(11) +
      `<path d="M20.8,29 C20,19.4 25,16.2 32,16.2 C39,16.2 44,19.4 43.2,29 C41.6,23.8 37.8,21.6 32,21.8 C26.2,21.6 22.4,23.8 20.8,29Z" fill="#6a4632" stroke="${INK}" stroke-width="1"/>` +
      eyes() + `<circle cx="27.6" cy="30.6" r="3.3" fill="none" stroke="#8a3a2a" stroke-width="1.1"/><circle cx="36.4" cy="30.6" r="3.3" fill="none" stroke="#8a3a2a" stroke-width="1.1"/><path d="M31,30.4 h2" stroke="#8a3a2a" stroke-width="1.1"/>` + brows() + nose + cheeks + smile },
    aidar: { bg: '#f4dfc2', name: 'Айдар', draw: () =>
      body('#2c8a57') + neck + head(11) + dots([[21.5, 24], [24.5, 19.5], [29, 16.8], [34, 16.4], [38.6, 18.6], [42, 22.8], [26.5, 22.4], [31.5, 20.4], [36.5, 21.2]], '#2d211a', 3.6) +
      eyes() + brows() + nose + cheeks + `<path d="M29.6,37.6 Q32,39.2 34.4,37.6" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` },
    fund: { bg: 'var(--surface-3)', name: 'Фонд', draw: () =>
      body('#3a4254') + `<path d="M28,47 L32,54 L36,47Z" fill="#eef0f3"/>` + neck + head(11) +
      `<path d="M20.6,26 C20.6,17 26,14.8 32,14.8 C38,14.8 43.4,17 43.4,26 C40,21.4 36,20.4 32,20.4 C28,20.4 24,21.4 20.6,26Z" fill="#b8b1a6" stroke="${INK}" stroke-width="1"/>` +
      eyes() + brows() + nose + `<path d="M30,38 h4" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>` },
  };

  function portrait(id, size, o) {
    o = o || {}; const h = H[id]; const k = ++uid;
    const ring = o.ring ? `<circle cx="32" cy="32" r="31" fill="none" stroke="${o.ring}" stroke-width="2.4"/>` : `<circle cx="32" cy="32" r="31.2" fill="none" stroke="var(--line-2)" stroke-width="1"/>`;
    return `<svg class="pt" width="${size || 48}" height="${size || 48}" viewBox="0 0 64 64" style="flex:none;display:block"><defs><clipPath id="pc${k}"><circle cx="32" cy="32" r="31"/></clipPath></defs><circle cx="32" cy="32" r="31" fill="${o.bg || h.bg}"/><g clip-path="url(#pc${k})">${h.draw()}</g>${ring}</svg>`;
  }

  /* ---------- Человечки (ноги в 0,0; рост ≈ 70 при s=1) ---------- */
  const HAIR = {
    short: (c) => `<path d="M-11.6,-57 C-12.4,-66 -7,-70 0,-70 C7,-70 12.4,-66 11.6,-57 C9,-62 5,-63.5 0,-63.2 C-5,-63.5 -9,-62 -11.6,-57Z" fill="${c}"/>`,
    bun: (c) => `<circle cx="0" cy="-70.5" r="4.6" fill="${c}"/><path d="M-11.8,-56 C-12.4,-66 -6.6,-69.4 0,-69.4 C6.6,-69.4 12.4,-66 11.8,-56 C10,-61.6 5.4,-63.4 0,-63.4 C-5.4,-63.4 -10,-61.6 -11.8,-56Z" fill="${c}"/>`,
    long: (c) => `<path d="M-12.4,-50 C-13.6,-66 -7,-70 0,-70 C7,-70 13.6,-66 12.4,-50 L12,-44 L8.5,-44 L9,-58 C5,-62.5 -5,-62.5 -9,-58 L-8.5,-44 L-12,-44Z" fill="${c}"/>`,
    cap: (c) => `<path d="M-12,-59 C-12,-68 12,-68 12,-59Z" fill="${c}"/><path d="M4,-59.5 h12 v2.4 h-12z" fill="${c}"/>`,
    scarf: (c) => `<path d="M-13.2,-52 C-14,-66 -7,-71 0,-71 C7,-71 14,-66 13.2,-52 C12.4,-46 8,-43.4 0,-43.4 C-8,-43.4 -12.4,-46 -13.2,-52Z M-9.8,-55 C-9.6,-61.6 -5.2,-63.4 0,-63.4 C5.2,-63.4 9.6,-61.6 9.8,-55 C9.8,-49.5 5.5,-46.6 0,-46.6 C-5.5,-46.6 -9.8,-49.5 -9.8,-55Z" fill="${c}" fill-rule="evenodd"/>`,
    bald: (c) => `<path d="M-11.8,-55 C-12.4,-58 -11.6,-60 -10.6,-61 L-10,-55Z M11.8,-55 C12.4,-58 11.6,-60 10.6,-61 L10,-55Z" fill="${c}"/>`,
    tub: (c) => `<path d="M-11.4,-61.5 C-11,-70 11,-70 11.4,-61.5 C6,-63 -6,-63 -11.4,-61.5Z" fill="${c}"/>`,
    kerchief: (c) => `<path d="M-12,-57.4 C-12.6,-67.6 -6.6,-70.6 0,-70.6 C6.6,-70.6 12.6,-67.6 12,-57.4 C9.6,-62 5,-63.4 0,-63.4 C-5,-63.4 -9.6,-62 -12,-57.4Z" fill="${c}"/><path d="M11,-63 l6,-3 l-1,5z" fill="${c}"/>`,
    curly: (c) => [[-9, -62], [-5, -66.5], [0, -68], [5, -66.5], [9, -62], [-2.5, -63.5], [3, -63.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="${c}"/>`).join(''),
  };
  function person(x, y, o) {
    o = Object.assign({ s: 1, shirt: '#3b8796', pants: '#3a4254', hair: 'short', hc: '#3a2a20', skin: SK, mood: 'ok', apron: null, hold: null, glasses: false, sweat: false, op: 1 }, o);
    const st = `stroke="${INK}" stroke-width="${1.5 / o.s}" stroke-linejoin="round"`;
    const mouth = o.mood === 'happy' ? `<path d="M-3.6,-51.4 Q0,-47.6 3.6,-51.4" fill="none" ${st} stroke-linecap="round"/>`
      : o.mood === 'sad' ? `<path d="M-3.4,-49 Q0,-52 3.4,-49" fill="none" ${st} stroke-linecap="round"/>`
        : o.mood === 'wow' ? `<ellipse cx="0" cy="-50" rx="1.8" ry="2.2" fill="${INK}"/>`
          : `<path d="M-2.6,-50.2 H2.6" fill="none" ${st} stroke-linecap="round"/>`;
    const eyesP = o.mood === 'happy' ? `<path d="M-6,-56 Q-4.4,-58 -2.8,-56 M2.8,-56 Q4.4,-58 6,-56" fill="none" stroke="${INK}" stroke-width="${1.4 / o.s}" stroke-linecap="round"/>`
      : `<circle cx="-4.2" cy="-56.4" r="1.35" fill="${INK}"/><circle cx="4.2" cy="-56.4" r="1.35" fill="${INK}"/>`;
    const hair = o.hair && HAIR[o.hair] ? HAIR[o.hair](o.hc) : '';
    const behind = o.hair === 'scarf' ? hair : '';
    return `<g transform="translate(${x},${y}) scale(${o.s})" opacity="${o.op}">
      <rect x="-9" y="-17" width="7" height="17" rx="3.4" fill="${o.pants}" ${st}/><rect x="2" y="-17" width="7" height="17" rx="3.4" fill="${o.pants}" ${st}/>
      <rect x="-14" y="-45" width="28" height="33" rx="12" fill="${o.shirt}" ${st}/>
      ${o.apron ? `<path d="M-9,-36 H9 V-13 Q0,-10 -9,-13Z" fill="${o.apron}" ${st}/>` : ''}
      ${o.bag ? `<rect x="11" y="-30" width="9" height="11" rx="2" fill="${o.bag}" ${st}/>` : ''}
      ${o.hold === 'cup' ? `<rect x="10" y="-35" width="7" height="9" rx="1.6" fill="#fff" ${st}/><path d="M11,-31.5 h5" stroke="var(--crust)" stroke-width="1.6"/>` : ''}
      ${behind}
      <circle cx="0" cy="-56" r="12.2" fill="${o.skin}" ${st}/>
      ${o.hair !== 'scarf' ? hair : ''}
      ${eyesP}${o.glasses ? `<circle cx="-4.2" cy="-56.4" r="3.4" fill="none" ${st}/><circle cx="4.2" cy="-56.4" r="3.4" fill="none" ${st}/>` : ''}
      <circle cx="-7.4" cy="-51.8" r="2" fill="#e8806c" opacity=".3"/><circle cx="7.4" cy="-51.8" r="2" fill="#e8806c" opacity=".3"/>
      ${mouth}
      ${o.sweat ? `<path d="M12.5,-66 q3,4.5 0,6.2 q-3,-1.7 0,-6.2z" fill="#8fd0e0" stroke="${INK}" stroke-width="${1 / o.s}"/>` : ''}
    </g>`;
  }

  /* ---------- Выпечка и предметы (центр в x,y; размер ≈ 24·s) ---------- */
  function pastry(kind, x, y, s) {
    s = s || 1; const st = `stroke="${INK}" stroke-width="${1.3 / s}" stroke-linejoin="round" stroke-linecap="round"`;
    const P = {
      croissant: `<path d="M-12,4 C-11,-6 -4,-9 0,-9 C4,-9 11,-6 12,4 C8,2 6,1 4,2 C2,-2 -2,-2 -4,2 C-6,1 -8,2 -12,4Z" fill="#e3a24c" ${st}/><path d="M-4,2 C-3,-4 3,-4 4,2 M-7.5,1.6 C-7,-4 -4,-6.5 -2,-7 M7.5,1.6 C7,-4 4,-6.5 2,-7" fill="none" ${st}/>`,
      echpochmak: `<path d="M0,-10 C2,-10 11,5 10,7 C9,9 -9,9 -10,7 C-11,5 -2,-10 0,-10Z" fill="#d99a48" ${st}/><circle cx="0" cy="-1" r="1.8" fill="#6b4a2e"/><path d="M-6,5.5 h12" stroke="#b9772e" stroke-width="${1.1 / s}"/>`,
      bun: `<circle cx="0" cy="0" r="9.5" fill="#dca05a" ${st}/><path d="M0,0 m-1.5,0 a1.5,1.5 0 1 1 3,0 a3.5,3.5 0 1 1 -6,-1 a6,6 0 1 1 10,2" fill="none" stroke="#8a4f22" stroke-width="${1.3 / s}"/>`,
      loaf: `<path d="M-13,4 C-13,-6 -6,-9 0,-9 C6,-9 13,-6 13,4 C13,7 -13,7 -13,4Z" fill="#c9843c" ${st}/><path d="M-6,-5 l2,5 M0,-6 l2,5 M6,-5 l2,5" fill="none" ${st}/>`,
      balesh: `<path d="M-12,5 C-12,-2 -6,-9 0,-9 C6,-9 12,-2 12,5Z" fill="#cf8f45" ${st}/><circle cx="0" cy="-8" r="2" fill="#6b4a2e"/><path d="M-12,5 h24" ${st}/>`,
      cup: `<path d="M-7,-7 h14 l-1.6,15 h-10.8z" fill="#fff" ${st}/><path d="M-7.6,-9 h15.2 v2.4 h-15.2z" fill="#6b4a2e" ${st}/><path d="M-6.3,-1 h12.6" stroke="var(--crust)" stroke-width="${2.4 / s}"/>`,
      mug: `<path d="M-8,-7 h13 v9 a6,6 0 0 1 -6,6 h-1 a6,6 0 0 1 -6,-6z" fill="#fff" ${st}/><path d="M5,-4 h2.4 a3,3 0 0 1 0,6 H5" fill="none" ${st}/><ellipse cx="-1.5" cy="-7" rx="6.5" ry="1.6" fill="#b87c4b"/>`,
      baguette: `<path d="M-14,4 C-15,1 10,-8 13,-6 C15,-4 -10,7 -14,4Z" fill="#d49248" ${st}/><path d="M-7,1 l2,-3 M-1,-1 l2,-3 M5,-3.5 l2,-3" fill="none" ${st}/>`,
      tea: `<path d="M-8,-5 h16 l-2,12 h-12z" fill="#f4efe6" ${st}/><path d="M-6.8,1 h13.6 l-1,6 h-11.6z" fill="#b8612a" opacity=".55"/>`,
    };
    return `<g transform="translate(${x},${y}) scale(${s})">${P[kind] || ''}</g>`;
  }
  const steam = (x, y, s, op) => `<g transform="translate(${x},${y}) scale(${s || 1})" opacity="${op || .55}" fill="none" stroke="var(--ink-3)" stroke-width="1.6" stroke-linecap="round"><path d="M-6,0 c-3,-5 3,-8 0,-13 c-2,-3 1,-6 0,-8"/><path d="M0,-2 c-3,-5 3,-8 0,-13 c-2,-3 1,-6 0,-8"/><path d="M6,0 c-3,-5 3,-8 0,-13 c-2,-3 1,-6 0,-8"/></g>`;

  /* ---------- Значки последствий ---------- */
  const FX = {
    rub: ['', '₽'], hp: ['heart', 'Силы'], mood: ['mood', 'Настроение'], skill: ['star', 'Навык'], team: ['team', 'Команда'],
    guests: ['guests', 'Гости'], rate: ['star', 'Рейтинг'], risk: ['alert', 'Риск'], ctrl: ['key', 'Контроль'], fam: ['home', 'Семья'],
    boss: ['store', 'Рашид'], save: ['bank', 'Копилка'], time: ['clock', 'Смены'], cost: ['wheat', 'Фудкост'], brand: ['spark', 'Бренд'],
  };
  function fx(list) {
    return `<div class="fx">${list.map(([k, v, label]) => {
      const cls = k === 'who' ? (v > 0 ? 'up' : v < 0 ? 'dn' : 'zero') : v > 0 ? 'up' : v < 0 ? 'dn' : 'zero';
      const ar = v ? (v > 0 ? '▲' : '▼').repeat(Math.abs(v)) : '·';
      if (k === 'who') return `<span class="fxc ${cls}">${IC.heart}${label} <span class="ar">${ar}</span></span>`;
      const d = FX[k]; return `<span class="fxc ${cls}">${d[0] ? IC[d[0]] : ''}${label || d[1]} <span class="ar">${ar}</span></span>`;
    }).join('')}</div>`;
  }

  /* ---------- HUD этапа ---------- */
  const tri = (n) => `<svg width="${6 + n * 6}" height="10" viewBox="0 0 ${6 + n * 6} 10">${Array.from({ length: n }, (_, i) => `<path d="M${i * 6 + 1},1 L${i * 6 + 7},5 L${i * 6 + 1},9Z" fill="currentColor"/>`).join('')}</svg>`;
  const speed = (on) => `<div class="speed">${[IC.pause.replace('<svg', '<svg width="12" height="12"'), tri(1), tri(2), tri(3)].map((s, i) => `<span class="${i === on ? 'on' : ''}">${s}</span>`).join('')}</div>`;
  function hud(o) {
    const left = o.who
      ? `<div class="who">${portrait(o.who.p, 38)}<div><b>${o.who.name}</b><small>${o.who.sub}</small></div></div>`
      : `<div class="brand"><div class="logo">${IC.loaf}</div><div><b>${o.brand}</b><small>${o.sub}</small></div></div>`;
    const ms = (o.metrics || []).map((m) => `<div class="metric"><span class="caps">${m.l}</span><div class="row"><span class="v">${m.v}</span>${m.spark ? MK.spark(m.spark, 40, 18) : ''}${m.extra || ''}</div><span class="delta ${m.dc || 'muted'}">${m.d || ''}</span></div>`).join('');
    const g = o.goal ? `<div class="vsep"></div><div class="metric goal" style="width:${o.goal.w || 240}px"><div class="row"><span class="caps">${o.goal.l}</span><span class="delta" style="color:var(--crust-t)">${String(o.goal.pct).replace('.', ',')} %</span></div>
        <div class="row"><span class="v" style="font-size:16px">${o.goal.v}</span><span class="delta muted">${o.goal.note}</span></div>
        <div class="bar"><i style="width:${o.goal.pct}%"></i>${(o.goal.ms || []).map((m) => `<span class="ms${m < o.goal.pct ? ' done' : ''}" style="left:${m}%"></span>`).join('')}</div></div>` : '';
    return `<header class="hud">${left}${o.stage ? `<span class="stage-chip"><i></i>${o.stage}</span>` : ''}<div class="clock"><span class="date">${o.date}</span>${speed(o.speed == null ? 1 : o.speed)}</div><div class="spacer"></div>${ms}${g}
      <div style="display:flex;gap:6px;margin-left:4px"><span class="icbtn">${IC.theme}</span><span class="icbtn">${IC.gear}</span></div></header>`;
  }

  /* ---------- Сцена «своя точка вблизи» (viewBox 960×620) ---------- */
  function shopScene(o) {
    o = Object.assign({ dim: false, hero: 'tired', queue: 6, gulya: false, sign: 'ТЁПЛЫЙ УГОЛ', sub: 'КОФЕ · ВЫПЕЧКА · С 7:00', rival: true, dimLine: 'островок 6,0 × 2,4 м · 14,4 м²', menu: [['Капучино 0,3', '180'], ['Раф ванильный', '240'], ['Круассан', '140'], ['Эчпочмак', '95'], ['Булочка с корицей', '110']], winLabel: 'окно на ул. Ленина', price: '275 ₽' }, o);
    const st = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"`;
    let s = `<defs>
      <pattern id="tile" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="var(--line)" stroke-width="1"/></pattern>
      <pattern id="brick" width="48" height="24" patternUnits="userSpaceOnUse"><path d="M0 12H48M0 24H48M24 0V12M0 12V24M48 12V24" fill="none" stroke="var(--line)" stroke-width="1"/></pattern>
      <pattern id="awn" width="40" height="10" patternUnits="userSpaceOnUse"><rect width="20" height="10" fill="var(--crust)"/><rect x="20" width="20" height="10" fill="#fbf4e8"/></pattern>
      <linearGradient id="glass" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#cfe3e4" stop-opacity=".55"/><stop offset="1" stop-color="#cfe3e4" stop-opacity=".2"/></linearGradient></defs>`;
    // стена и пол
    s += `<rect x="0" y="0" width="960" height="620" fill="var(--warm)"/><rect x="0" y="0" width="960" height="470" fill="url(#brick)" opacity=".7"/>`;
    s += `<rect x="0" y="470" width="960" height="150" fill="var(--paper-2)"/><rect x="0" y="470" width="960" height="150" fill="url(#tile)"/><path d="M0 470H960" stroke="${INK}" stroke-width="1.5"/>`;
    // окно на улицу Ленина: напротив — «Хлебный двор. Скоро!»
    s += `<g><rect x="30" y="92" width="270" height="250" rx="4" fill="#dcebec" ${st}/>
      <rect x="30" y="250" width="270" height="92" fill="#e9e1d3"/><path d="M30 250H300" stroke="${INK}" stroke-width="1"/>
      <path d="M30 222 H300" stroke="#9aa3b0" stroke-width="1.2" stroke-dasharray="6 5"/>
      ${o.rival ? `<rect x="176" y="104" width="118" height="128" fill="#efe9f3" stroke="#8d7aa0" stroke-width="1.2"/>
      <rect x="182" y="176" width="106" height="36" rx="3" fill="var(--rival)"/>
      <text x="235" y="191" text-anchor="middle" font-family="var(--f-display)" font-size="9" font-weight="600" fill="#fff" letter-spacing=".06em">ХЛЕБНЫЙ ДВОР</text>
      <text x="235" y="205" text-anchor="middle" font-family="var(--f-body)" font-size="10.5" font-weight="600" fill="#fff">Скоро!</text>
      <path d="M186 122h100M186 140h100M186 158h100" stroke="#c9bdd6" stroke-width="1"/>
      ` : `<rect x="96" y="128" width="190" height="104" fill="#e7ddcc" stroke="#9a8f7c" stroke-width="1.2"/><rect x="110" y="150" width="34" height="40" fill="#cfe3e4" stroke="#9a8f7c"/><rect x="160" y="150" width="34" height="40" fill="#cfe3e4" stroke="#9a8f7c"/><rect x="210" y="150" width="34" height="40" fill="#cfe3e4" stroke="#9a8f7c"/><circle cx="262" cy="196" r="18" fill="#8fbf8f" opacity=".8"/><path d="M262 214v36" stroke="#6b4a2e" stroke-width="3"/><rect x="60" y="226" width="140" height="22" rx="5" fill="#c0412d" stroke="#7a2e22"/><rect x="70" y="230" width="20" height="10" fill="#cfe3e4"/><rect x="98" y="230" width="20" height="10" fill="#cfe3e4"/><rect x="126" y="230" width="20" height="10" fill="#cfe3e4"/><rect x="154" y="230" width="20" height="10" fill="#cfe3e4"/><path d="M130 226 l-10 -30 M130 196 h30" stroke="#6b7485" stroke-width="1.4" fill="none"/>`}
      <path d="M52 250 V160 M44 160 h16" stroke="#6b7485" stroke-width="2"/><circle cx="52" cy="156" r="5" fill="#f3d36b" stroke="#6b7485" stroke-width="1.4"/>
      <path d="M165 92V342M30 170H300" stroke="${INK}" stroke-width="3" opacity=".9"/><rect x="30" y="92" width="270" height="250" rx="4" fill="none" ${st}/>
      <text x="165" y="360" text-anchor="middle" font-family="var(--f-body)" font-style="italic" font-size="11" fill="var(--ink-3)">${o.winLabel}</text></g>`;
    // размерная линия «чертежа»
    s += `<g stroke="var(--ink-3)" stroke-width="1" fill="none"><path d="M340 38H930M340 32V44M930 32V44"/></g><text x="635" y="30" text-anchor="middle" font-family="var(--f-mono)" font-size="10.5" fill="var(--ink-3)">${o.dimLine}</text>`;
    // вывеска и маркиза
    s += `<rect x="360" y="56" width="560" height="52" rx="6" fill="var(--ink)" ${st}/>
      <text x="640" y="84" text-anchor="middle" font-family="var(--f-display)" font-size="20" font-weight="700" fill="#fbf4e8" letter-spacing=".14em">${o.sign}</text>
      <text x="640" y="100" text-anchor="middle" font-family="var(--f-mono)" font-size="10" fill="#e59a3e" letter-spacing=".12em">${o.sub}</text>`;
    s += `<path d="M340 112 H940 V140 ${Array.from({ length: 15 }, (_, i) => `a20,14 0 0 1 -40,0`).join(' ')} Z" fill="url(#awn)" ${st}/>`;
    // задняя стена островка: меню-доска и полки
    s += `<rect x="360" y="170" width="560" height="230" fill="var(--surface-2)" ${st}/>`;
    s += `<rect x="620" y="186" width="286" height="116" rx="4" fill="#2b3a33" ${st}/>`;
    const menu = o.menu;
    menu.forEach(([n, p], i) => { s += `<text x="636" y="${208 + i * 19}" font-family="var(--f-body)" font-size="12" fill="#eef2ea">${n}</text><text x="890" y="${208 + i * 19}" text-anchor="end" font-family="var(--f-mono)" font-size="12" fill="#f3d36b">${p}</text>`; });
    s += `<path d="M376 232H600M376 300H600" stroke="${INK}" stroke-width="2"/>`;
    [[392, 214, '#6b4a2e'], [420, 214, '#c46f17'], [448, 214, '#6b4a2e'], [476, 214, '#3b8796']].forEach(([x, y, c]) => { s += `<rect x="${x}" y="${y - 22}" width="20" height="26" rx="3" fill="${c}" ${st}/>`; });
    s += pastry('loaf', 520, 222, 1.2) + pastry('loaf', 566, 222, 1.2) + (o.lowShelf === false ? pastry('balesh', 560, 290, 1.3) : pastry('baguette', 420, 290, 1.4) + pastry('baguette', 470, 290, 1.4) + pastry('balesh', 540, 290, 1.3));
    // бариста(ы) за стойкой
    if (o.gulya) s += person(746, 420, { s: 1.5, shirt: '#f9f7f2', apron: '#c0412d', hair: 'kerchief', hc: '#c0412d', mood: 'happy' });
    s += person(o.gulya ? 694 : 722, 420, { s: 1.6, shirt: '#f4efe6', apron: 'var(--crust)', hair: 'short', hc: '#3a2a20', mood: o.hero === 'tired' ? 'ok' : 'happy', sweat: o.hero === 'tired' });
    // кофемашина
    s += `<rect x="790" y="306" width="118" height="92" rx="8" fill="#9aa3b0" ${st}/><rect x="802" y="318" width="94" height="30" rx="4" fill="#6b7485" ${st}/><circle cx="822" cy="333" r="5" fill="#f3d36b"/><circle cx="878" cy="333" r="5" fill="#8fd0e0"/><path d="M820 348v16M876 348v16" stroke="${INK}" stroke-width="3"/>` + pastry('cup', 820, 378, 1) + pastry('cup', 876, 378, 1) + steam(848, 300, 1.1, .5);
    // стойка и витрина
    s += `<rect x="340" y="398" width="600" height="18" rx="4" fill="#8a5a3a" ${st}/><rect x="352" y="416" width="576" height="104" fill="#b07a4f" ${st}/>`;
    s += `<path d="M352 440H928M352 470H928M352 500H928" stroke="#9a6a42" stroke-width="1.2"/>`;
    // касса
    s += `<rect x="356" y="362" width="72" height="36" rx="5" fill="var(--ink)" ${st}/><rect x="364" y="367" width="56" height="20" rx="3" fill="#8fd0e0"/><text x="392" y="381" text-anchor="middle" font-family="var(--f-mono)" font-size="10" font-weight="700" fill="#18223a">${o.price}</text>`;
    // витрина-стекло
    s += `<rect x="440" y="330" width="218" height="68" rx="6" fill="url(#glass)" ${st}/><path d="M440 364H658" stroke="${INK}" stroke-width="1"/>`;
    const top = o.top || ['croissant', 'croissant', null, null, 'bun', 'bun'];
    const bot = o.bot || ['echpochmak', 'echpochmak', 'echpochmak', 'balesh', null, 'echpochmak'];
    top.forEach((k, i) => { s += k ? pastry(k, 460 + i * 35, 352, .95) : `<rect x="${448 + i * 35}" y="341" width="24" height="18" rx="4" fill="none" stroke="var(--ink-3)" stroke-dasharray="3 3"/>`; });
    bot.forEach((k, i) => { s += k ? pastry(k, 460 + i * 35, 384, .95) : `<rect x="${448 + i * 35}" y="374" width="24" height="18" rx="4" fill="none" stroke="var(--ink-3)" stroke-dasharray="3 3"/>`; });
    s += steam(500, 327, .8, .45) + steam(600, 327, .7, .35);
    // очередь гостей
    const Q = [
      { x: 300, shirt: '#3b6fb0', hair: 'cap', hc: '#6b4a2e', glasses: true, mood: 'happy', hold: null, pants: '#6b4a2e' },
      { x: 232, shirt: '#e5b53c', hair: 'long', hc: '#6a4632', mood: 'ok', bag: '#c0412d' },
      { x: 166, shirt: '#2c8a57', hair: 'short', hc: '#2d211a', mood: 'ok' },
      { x: 102, shirt: '#9580a8', hair: 'bun', hc: '#1d1a22', mood: 'sad', bag: '#3a4254' },
      { x: 40, shirt: '#c46f17', hair: 'curly', hc: '#3a2a20', mood: 'ok' },
      { x: -18, shirt: '#5d6576', hair: 'short', hc: '#77716a', mood: 'sad' },
    ].slice(0, o.queue);
    Q.forEach((g) => { s += person(g.x, 590, Object.assign({ s: 1.5 }, g)); });
    // тень пола и дверь-граница
    s += `<path d="M0 596H960" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2 5"/>`;
    return s;
  }

  window.ART = { portrait, person, pastry, steam, fx, hud, shopScene, H, INK };
})();
