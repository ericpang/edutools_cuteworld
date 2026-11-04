// Cute characters drawn as SVG, so there are no image files to ship and every player can look a little different.
const INK = '#5b4a6b';
const stroke = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

export const SHIRTS = ['#ff7eb6', '#4fc3f7', '#ffca28', '#81c784', '#b39ddb', '#ff8a65', '#4db6ac', '#f06292'];
const SKINS = ['#ffe3cc', '#f6d1a8', '#e3b183', '#c48a5f'];
const HAIRS = ['#4a3426', '#2b2438', '#b8742c', '#7a3f22'];

const hash = (text) => {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

// A player's look: shirt colour is their stored choice, skin and hair come from their id.
export function look({ uid = '', persona = 'female', color = 0 }) {
  const h = hash(uid);
  return { persona, shirt: SHIRTS[Math.abs(color) % SHIRTS.length], skin: SKINS[h % 4], hair: HAIRS[(h >>> 3) % 4] };
}

export function avatarSvg({ persona, shirt, skin, hair }) {
  const girl = persona === 'female';
  const back = girl ? `<circle cx="10" cy="43" r="9" fill="${hair}" ${stroke}/><circle cx="62" cy="43" r="9" fill="${hair}" ${stroke}/>` : '';
  const top = girl
    ? `<path d="M11 35C8 9 64 9 61 35C56 25 47 21 36 21C25 21 16 25 11 35Z" fill="${hair}" ${stroke}/>` +
      `<circle cx="51" cy="14" r="5" fill="#ff7eb6" ${stroke}/><circle cx="60" cy="13" r="5" fill="#ff7eb6" ${stroke}/><circle cx="55.5" cy="14" r="3" fill="#ff4d94" ${stroke}/>`
    : `<path d="M12 34C9 8 63 8 60 34C54 25 46 21 36 21C26 21 18 25 12 34Z" fill="${hair}" ${stroke}/><path d="M29 13q7-10 14 0" fill="${hair}" ${stroke}/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 84" width="72" height="84">${back}` +
    `<rect x="21" y="52" width="30" height="24" rx="11" fill="${shirt}" ${stroke}/>` +
    `<ellipse cx="29" cy="78" rx="7" ry="4" fill="#fff" ${stroke}/><ellipse cx="43" cy="78" rx="7" ry="4" fill="#fff" ${stroke}/>` +
    `<circle cx="16" cy="63" r="5" fill="${skin}" ${stroke}/><circle cx="56" cy="63" r="5" fill="${skin}" ${stroke}/>` +
    `<circle cx="36" cy="35" r="24" fill="${skin}" ${stroke}/>${top}` +
    '<ellipse cx="28" cy="39" rx="3.4" ry="4.4" fill="#3b2a4d"/><ellipse cx="44" cy="39" rx="3.4" ry="4.4" fill="#3b2a4d"/>' +
    '<circle cx="29.2" cy="37.4" r="1.3" fill="#fff"/><circle cx="45.2" cy="37.4" r="1.3" fill="#fff"/>' +
    '<circle cx="21.5" cy="46" r="4.4" fill="#ff9db5" opacity=".65"/><circle cx="50.5" cy="46" r="4.4" fill="#ff9db5" opacity=".65"/>' +
    '<path d="M32 47q4 4 8 0" fill="none" stroke="#3b2a4d" stroke-width="2.2" stroke-linecap="round"/></svg>'
  );
}

export const avatarUrl = (l) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(l))}`;

const cache = new Map();
// A decoded <img> for canvas drawing; draws nothing until `complete`.
export function avatarImage(l) {
  const key = `${l.persona}|${l.shirt}|${l.skin}|${l.hair}`;
  let img = cache.get(key);
  if (!img) {
    img = new Image();
    img.src = avatarUrl(l);
    cache.set(key, img);
  }
  return img;
}
