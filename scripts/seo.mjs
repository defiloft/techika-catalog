// Статичні сторінки для Google: категорії (katalog/<розділ>/), товари (tovar/<ID>.html), sitemap.xml.
// Сам каталог (index.html) малює товари скриптом, а пошуковикам краще віддати готовий HTML.
// Розбір дописів не дублюємо: беремо CATS, parse() тощо прямо з index.html, тож категорії й ціни збігаються з сайтом.
// Запуск: node scripts/seo.mjs (після scrape.py, у тому ж workflow).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SITE = 'https://techika.com.ua/';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const from = html.indexOf('/* ---------- налаштування магазину'), to = html.indexOf('/* ---------- пошук:');
if (from < 0 || to < 0) throw new Error('index.html: не знайшов блок розбору дописів');
const {CATS, CAT, SLUG, SHOP, parse} = vm.runInNewContext(html.slice(from, to) + ';({CATS, CAT, SLUG, SHOP, parse})', {Intl, encodeURIComponent});

// Адреси розділів (SLUG) — з index.html; тут лише назви в однині для заголовків товарів.
const ONE = {washers: 'Пральна машина', dryers: 'Сушильна машина', fridges: 'Холодильник', freezers: 'Морозильна камера',
  dishwashers: 'Посудомийна машина', hobs: 'Варильна поверхня', stoves: 'Плита', ovens: 'Духова шафа', micro: 'Мікрохвильова піч',
  hoods: 'Витяжка', coffee: 'Кавомашина', tvs: 'Телевізор', treadmills: 'Бігова доріжка', bikes: 'Велотренажер', orbitreks: 'Орбітрек', other: 'Техніка'};
// Рід: «б/в» однаково, а «нова/новий» — ні.
const FEM = new Set(['washers', 'dryers', 'freezers', 'dishwashers', 'hobs', 'stoves', 'ovens', 'micro', 'hoods', 'coffee', 'treadmills']);

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
const seen = new Set();
const ALL = (data.products || []).map(parse).filter(p => p && !seen.has(p.id) && seen.add(p.id))
  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
const inCat = (p, c) => c === 'sale' ? !!p.oldPrice : p.cat === c;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const money = n => new Intl.NumberFormat('uk-UA').format(n).replace(/\s/g, ' ');
const src = (x, up) => /^https?:/.test(x) ? x : up + x;  // фото бувають і посиланнями на Telegram
const file = p => String(p.id).replace(/[^\w-]+/g, '-') + '.html';
const name = p => [p.brand, p.model].filter(Boolean).join(' ');
const state = p => p.isNew ? (FEM.has(p.cat) ? 'нова' : 'новий') : 'б/в';
const day = d => (d || '').slice(0, 10);
const plural = (n, a, b, c) => { const d = Math.abs(n) % 100, f = d % 10; return d > 10 && d < 20 ? c : f > 1 && f < 5 ? b : f === 1 ? a : c; };
const ADDR = `м. ${SHOP.city}, ${SHOP.address}`;
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const STORE = {'@type': 'Store', '@id': SITE + '#shop', name: SHOP.name, url: SITE, image: SITE + 'img/emblem.png', telephone: '+' + SHOP.viber,
  address: {'@type': 'PostalAddress', streetAddress: SHOP.address, addressLocality: SHOP.city, addressCountry: 'UA'},
  openingHoursSpecification: {'@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '10:00', closes: '19:00'},
  sameAs: ['https://t.me/' + SHOP.tg]};

function page({title, desc, canon, image, up, body, json}) {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="website">
<meta property="og:locale" content="uk_UA">
<meta property="og:site_name" content="${esc(SHOP.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${image || SITE + 'img/emblem.png'}">
<meta name="theme-color" content="#DDE5EF">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Onest:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${up}katalog/site.css">
${json.map(ld).join('\n')}
<script>window.goatcounter = {path: () => '/'};</script>
<script data-goatcounter="https://techika-catalog.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</head>
<body>
<div class="page">
<header class="header"><a class="shop" href="${up}">Техніка з Європи <span>Вигідно</span></a><a href="${up}" aria-label="На головну"><img class="emblem" src="${up}img/emblem.png?v=2" width="48" height="48" alt=""></a></header>
${body}
<footer class="footer">
  <p><b>${esc(SHOP.name)}</b> — вживана та нова побутова техніка з Європи в Києві.</p>
  <p>${esc(ADDR)} (${esc(SHOP.addressHint)}) · ${esc(SHOP.hours)} · <a href="${esc(SHOP.mapUrl)}" target="_blank" rel="noopener">На карті</a></p>
  <p class="btns"><a class="btn tg" href="https://t.me/${SHOP.tg}" target="_blank" rel="noopener" data-track="click-telegram">Telegram</a><a class="btn vb" href="viber://chat?number=%2B${SHOP.viber}" data-track="click-viber">Viber</a></p>
  <nav class="cats" aria-label="Розділи каталогу">${CATS.filter(c => SLUG[c.id] && COUNT[c.id]).map(c => `<a href="${up}katalog/${SLUG[c.id]}/">${esc(c.name)}</a>`).join('')}</nav>
</footer>
</div>
<script>document.addEventListener('click', e => { const a = e.target.closest('[data-track]'); if (a) try { window.goatcounter?.count?.({path: a.dataset.track, title: document.title, event: true}); } catch {} });</script>
</body>
</html>
`;
}

const card = (p, up) => `<li><a class="card" href="${up}tovar/${file(p)}">
  <span class="ph">${p.photos[0] ? `<img src="${esc(src(p.photos[0], up))}" alt="${esc(name(p) || ONE[p.cat])}" loading="lazy" decoding="async">` : ''}${p.oldPrice && p.price ? `<span class="off">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ''}</span>
  ${p.price ? `<span class="price">${money(p.price)} <small>грн</small></span>` : ''}
  <span class="nm"><b>${esc(p.brand)}</b> ${esc(p.model)}</span>
  <span class="sub">${esc(ONE[p.cat])}, ${state(p)} · ID ${esc(p.id)}</span></a></li>`;

const COUNT = {};
for (const c of CATS) COUNT[c.id] = ALL.filter(p => inCat(p, c.id)).length;

// Що писати в заголовках розділів: те, що люди шукають у Google.
const lower = s => s[0].toLowerCase() + s.slice(1);
function catText(c, n) {
  if (c.id === 'sale') return {h1: 'Розпродаж техніки з Європи в Києві', title: `Розпродаж б/в техніки з Європи — знижки, Київ | ${SHOP.name}`,
    desc: `Знижки на вживану побутову техніку з Європи: ${n} ${plural(n, 'товар', 'товари', 'товарів')} зі зниженою ціною. Перевірені, з гарантією. ${ADDR}.`};
  return {h1: `${c.name} б/в з Європи в Києві`, title: `${c.name} б/в з Європи — купити в Києві | ${SHOP.name}`,
    desc: `${c.name} б/в та нові з Німеччини й Європи: ${n} в наявності, ціни від ${money(Math.min(...ALL.filter(p => inCat(p, c.id) && p.price).map(p => p.price)))} грн. Перевірені, з гарантією. ${ADDR}, ${SHOP.hours}.`};
}

const out = new Map();  // шлях → вміст
const urls = [];        // [адреса, дата]

for (const c of CATS) {
  if (!SLUG[c.id] || !COUNT[c.id]) continue;
  const items = ALL.filter(p => inCat(p, c.id)), t = catText(c, items.length), canon = `${SITE}katalog/${SLUG[c.id]}/`, up = '../../';
  const body = `<main>
<nav class="crumbs"><a href="${up}">Головна</a> › <span>${esc(c.name)}</span></nav>
<h1>${esc(t.h1)}</h1>
<p class="lead">${items.length} ${plural(items.length, 'товар', 'товари', 'товарів')} в наявності. Уся техніка — з Європи, перевірена перед продажем, з гарантією. Подивитися наживо: ${esc(ADDR)}, щодня ${esc(SHOP.hours.replace(/, без вихідних/, ''))}.</p>
<p><a class="btn primary" href="${up}?cat=${c.id}">Відкрити з фільтрами</a></p>
<ul class="grid">${items.map(p => card(p, up)).join('')}</ul>
</main>`;
  out.set(`katalog/${SLUG[c.id]}/index.html`, page({title: t.title, desc: t.desc, canon, up, body, json: [
    {'@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      {'@type': 'ListItem', position: 1, name: 'Головна', item: SITE}, {'@type': 'ListItem', position: 2, name: c.name, item: canon}]}]}));
  urls.push([canon, day(items[0]?.date)]);
}

for (const p of ALL) {
  const c = CAT[p.cat], nm = name(p), up = '../', canon = `${SITE}tovar/${file(p)}`;
  const head = `${ONE[p.cat]} ${nm || 'ID ' + p.id}`;
  const title = `${head} ${state(p)}${p.price ? ` — ${money(p.price)} грн` : ''}, Київ | ${SHOP.name}`;
  const facts = [p.chips.join(', '), p.warrantyText && `гарантія ${p.warrantyText}`].filter(Boolean).join('; ');
  const desc = `${head} ${state(p)} з Європи${p.price ? ` за ${money(p.price)} грн` : ''}${facts ? ` (${facts})` : ''}. ID ${p.id}. Подивитися: ${ADDR}.`;
  const text = p.text.split('\n').map(l => l.trim()).filter(Boolean).map(esc).join('<br>');
  const ask = `Добрий день! Цікавить ID ${p.id}, ${nm}${p.price ? `, ${money(p.price)} грн` : ''}`;
  const body = `<main class="product">
<nav class="crumbs"><a href="${up}">Головна</a> › ${SLUG[p.cat] ? `<a href="${up}katalog/${SLUG[p.cat]}/">${esc(c.name)}</a>` : esc(c.name)} › <span>ID ${esc(p.id)}</span></nav>
<div class="pgrid">
<div class="photos">${p.photos.map((ph, i) => `<img src="${esc(src(ph, up))}" alt="${esc(nm || ONE[p.cat])}, фото ${i + 1}" ${i ? 'loading="lazy" ' : ''}decoding="async">`).join('')}</div>
<div class="pinfo">
<h1><span>${esc(ONE[p.cat])}</span> ${esc(nm || 'ID ' + p.id)}</h1>
${p.price ? `<p class="price big">${money(p.price)} <small>грн</small>${p.oldPrice ? ` <s>${money(p.oldPrice)} грн</s>` : ''}</p>` : ''}
<p class="sub">ID ${esc(p.id)} · ${p.isNew ? 'Нова' : 'Б/в'} · ${p.reserved ? 'Заброньовано' : 'В наявності'}${p.warrantyText ? ` · Гарантія ${esc(p.warrantyText)}` : ''}</p>
<p class="btns"><a class="btn primary" href="https://t.me/${SHOP.tg}?text=${encodeURIComponent(ask)}" target="_blank" rel="noopener" data-track="click-telegram">Написати в Telegram</a><a class="btn vb" href="viber://chat?number=%2B${SHOP.viber}" data-track="click-viber">Viber</a></p>
<p class="desc">${text}</p>
<p><a href="${up}?p=${encodeURIComponent(p.id)}">Відкрити в каталозі</a></p>
</div>
</div>
</main>`;
  const product = {'@context': 'https://schema.org', '@type': 'Product', name: `${ONE[p.cat]} ${nm}`.trim(), sku: p.id, category: c.name,
    ...(p.brand && {brand: {'@type': 'Brand', name: p.brand}}), ...(p.model && {model: p.model}),
    ...(p.photos.length && {image: p.photos.map(x => src(x, SITE))}), description: p.text.slice(0, 500),
    ...(p.price && {offers: {'@type': 'Offer', url: canon, price: p.price, priceCurrency: 'UAH',
      itemCondition: p.isNew ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
      availability: p.reserved ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock', seller: {'@id': SITE + '#shop'}}})};
  out.set(`tovar/${file(p)}`, page({title, desc, canon, image: p.photos[0] && src(p.photos[0], SITE), up, body, json: [product, {'@context': 'https://schema.org', ...STORE}]}));
  urls.push([canon, day(p.date)]);
}

// Записуємо лише змінене; сторінки проданих товарів і порожніх розділів прибираємо.
let wrote = 0, removed = 0;
for (const [rel, s] of out) {
  const f = path.join(ROOT, rel);
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === s) continue;
  fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, s); wrote++;
}
const tdir = path.join(ROOT, 'tovar');
for (const f of fs.existsSync(tdir) ? fs.readdirSync(tdir) : []) if (!out.has('tovar/' + f)) { fs.rmSync(path.join(tdir, f)); removed++; }
const kdir = path.join(ROOT, 'katalog');
for (const d of fs.readdirSync(kdir, {withFileTypes: true})) if (d.isDirectory() && !out.has(`katalog/${d.name}/index.html`)) { fs.rmSync(path.join(kdir, d.name), {recursive: true}); removed++; }

const newest = urls.map(u => u[1]).filter(Boolean).sort().pop();
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[[SITE, newest], ...urls].map(([u, d]) => `<url><loc>${esc(u)}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
const sm = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(sm) || fs.readFileSync(sm, 'utf8') !== sitemap) fs.writeFileSync(sm, sitemap);
console.log(`seo: ${out.size} сторінок (записано ${wrote}, прибрано ${removed}), ${ALL.length} товарів`);
