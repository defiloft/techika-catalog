// Статичні сторінки для Google: категорії (katalog/<розділ>/), товари (tovar/<ID>.html), sitemap.xml.
// Сам каталог (index.html) малює товари скриптом, а пошуковикам краще віддати готовий HTML.
// Розбір дописів не дублюємо: беремо CATS, parse() тощо прямо з index.html, тож категорії й ціни збігаються з сайтом.
// Запуск: node scripts/seo.mjs (після scrape.py, у тому ж workflow).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as RU from './ru.mjs';
import * as TXT from './seo-text.mjs';

const SITE = 'https://techika.com.ua/';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const from = html.indexOf('/* ---------- налаштування магазину'), to = html.indexOf('/* ---------- пошук:');
if (from < 0 || to < 0) throw new Error('index.html: не знайшов блок розбору дописів');
const {CATS, CAT, SLUG, SHOP, parse} = vm.runInNewContext(html.slice(from, to) + ';({CATS, CAT, SLUG, SHOP, parse})', {Intl, encodeURIComponent});

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
const day = d => (d || '').slice(0, 10);
const plural = (n, a, b, c) => { const d = Math.abs(n) % 100, f = d % 10; return d > 10 && d < 20 ? c : f > 1 && f < 5 ? b : f === 1 ? a : c; };
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const STORE = {'@type': 'Store', '@id': SITE + '#shop', name: SHOP.name, url: SITE, image: SITE + 'img/emblem.png', telephone: '+' + SHOP.viber,
  address: {'@type': 'PostalAddress', streetAddress: SHOP.address, addressLocality: SHOP.city, addressCountry: 'UA'},
  openingHoursSpecification: {'@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '10:00', closes: '19:00'},
  sameAs: ['https://t.me/' + SHOP.tg]};

// Мови. Українська — основна (корінь сайту), російська — копія тих самих сторінок у ru/.
// Google бачить їх як переклади одна одної через hreflang, тож кожна ранжується за запитами своєю мовою.
const UK = {
  code: 'uk', locale: 'uk_UA', base: '', slug: SLUG, tr: s => s,
  // Адреси розділів (SLUG) — з index.html; тут лише назви в однині для заголовків товарів.
  one: {washers: 'Пральна машина', dryers: 'Сушильна машина', fridges: 'Холодильник', freezers: 'Морозильна камера',
    dishwashers: 'Посудомийна машина', hobs: 'Варильна поверхня', stoves: 'Плита', ovens: 'Духова шафа', micro: 'Мікрохвильова піч',
    hoods: 'Витяжка', coffee: 'Кавомашина', tvs: 'Телевізор', treadmills: 'Бігова доріжка', bikes: 'Велотренажер', orbitreks: 'Орбітрек', other: 'Техніка'},
  // Рід: «б/в» однаково, а «нова/новий» — ні.
  fem: new Set(['washers', 'dryers', 'freezers', 'dishwashers', 'hobs', 'stoves', 'ovens', 'micro', 'hoods', 'coffee', 'treadmills']),
  used: 'б/в', newF: 'нова', newM: 'новий', catName: c => c.name,
  shop: SHOP.name, logo: `Техніка з Європи <span>Вигідно!</span>`, home: 'Головна', toHome: 'На головну', sections: 'Розділи каталогу', sectionsShort: 'Розділи:',
  addr: `м. ${SHOP.city}, ${SHOP.address}`, hint: SHOP.addressHint, hours: SHOP.hours, map: 'На карті',
  about: 'вживана та нова побутова техніка з Європи в Києві.',
  goods: n => `${n} ${plural(n, 'товар', 'товари', 'товарів')}`,
  // Заголовки розділів під пошукові запити. «б/у» в title — бо саме так найчастіше набирають навіть українською;
  // в H1 і тексті — правильне «б/в» і «вживані». Тексти розділів — у scripts/seo-text.mjs.
  txt: TXT.UK, kyiv: 'Київ', inKyiv: 'в Києві', ua: TXT.DELIVERY ? ', доставка по Україні' : '', orUa: TXT.DELIVERY ? ' або доставка по Україні' : '',
  catText(c, n, min, brands) {
    const from = min ? `, від ${money(min)} грн` : '', br = brands.length ? `. ${brands.slice(0, 4).join(', ')} та інші` : '';
    if (c.id === 'sale') return {h1: `Уцінена техніка з Європи — розпродаж у Києві`, title: `Уцінена б/у техніка з Європи — знижки, Київ${this.ua} | ${this.shop}`,
      desc: `Уцінка і знижки на вживану побутову техніку з Європи: ${this.goods(n)} зі зниженою ціною${from}. Перевірені, гарантія 3 місяці. ${this.addr}${this.orUa}.`,
      h2: 'Розпродаж вживаної техніки', text: 'Тут уся техніка зі зниженою ціною: пральні машини, холодильники, посудомийки, плити та інше. Знижки оновлюються щодня — що бачите на сторінці, те й в наявності.'};
    const t = this.txt[c.id] || {acc: c.name.toLowerCase(), text: ''};
    return {h1: `${c.name} б/в з Європи — Київ${this.ua}`, title: `${c.name} б/у з Європи — купити в Києві${this.ua} | ${this.shop}`,
      desc: `Купити ${t.acc} з Європи: ${n} в наявності${from}${br}. Перевірені, гарантія 3 місяці. ${this.addr} (${this.hint})${this.orUa}.`,
      h2: `Купити ${t.acc} ${this.inKyiv}`, text: t.text};
  },
  facts: (n, min, brands, addr, hint, hours) => `Зараз в наявності ${UK.goods(n)}${min ? `, ціни від ${money(min)} грн` : ''}.${brands.length ? ` Бренди: ${brands.join(', ')}.` : ''} На кожну одиницю — гарантія 3 місяці. Подивитися й перевірити наживо можна в магазині: ${addr} (${hint}), щодня ${hours}.${TXT.DELIVERY ? ' Відправляємо по всій Україні — напишіть у Telegram чи Viber, і домовимося про доставку.' : ''}`,
  lead: (n, addr, hours) => `${UK.goods(n)} в наявності. Уся техніка — з Європи, перевірена перед продажем, з гарантією. Подивитися наживо: ${addr}, щодня ${hours}.`,
  filters: 'Відкрити з фільтрами', fromEU: 'з Європи', forPrice: 'за', warranty: 'гарантія', Warranty: 'Гарантія', look: 'Подивитися',
  ask: 'Добрий день! Цікавить', photo: 'фото', isNew: 'Нова', isUsed: 'Б/в', reserved: 'Заброньовано', inStock: 'В наявності',
  write: 'Написати в Telegram', askAll: 'З усіх питань пишіть:', open: 'Відкрити в каталозі', switchTo: 'ru', switchLabel: 'На русском',
};
const RUL = {
  ...UK, code: 'ru', locale: 'ru_UA', base: 'ru/', slug: RU.SLUG, tr: RU.tr, one: RU.ONE, fem: RU.FEM,
  used: 'б/у', newF: 'новая', newM: 'новый', catName: c => RU.NAME[c.id] || c.name,
  shop: 'Техника из Европы', logo: `Техника из Европы <span>Выгодно!</span>`, home: 'Главная', toHome: 'На главную', sections: 'Разделы каталога', sectionsShort: 'Разделы:',
  addr: `г. Киев, ${RU.tr(SHOP.address)}`, hint: SHOP.addressHint.replace('Шулявська', 'Шулявская'), hours: SHOP.hours.replace('без вихідних', 'без выходных'), map: 'На карте',
  about: 'б/у и новая бытовая техника из Европы в Киеве.',
  goods: n => `${n} ${plural(n, 'товар', 'товара', 'товаров')}`,
  txt: TXT.RU, kyiv: 'Киев', inKyiv: 'в Киеве', ua: TXT.DELIVERY ? ', доставка по Украине' : '', orUa: TXT.DELIVERY ? ' или доставка по Украине' : '',
  catText(c, n, min, brands) {
    const from = min ? `, от ${money(min)} грн` : '', br = brands.length ? `. ${brands.slice(0, 4).join(', ')} и другие` : '';
    if (c.id === 'sale') return {h1: 'Уцененная техника из Европы — распродажа в Киеве', title: `Уцененная б/у техника из Европы — скидки, Киев${this.ua} | ${this.shop}`,
      desc: `Уценка и скидки на б/у бытовую технику из Европы: ${this.goods(n)} по сниженной цене${from}. Проверенные, гарантия 3 месяца. ${this.addr}${this.orUa}.`,
      h2: 'Распродажа б/у техники', text: 'Здесь вся техника со сниженной ценой: стиральные машины, холодильники, посудомойки, плиты и другое. Скидки обновляются ежедневно — что видите на странице, то и в наличии.'};
    const nm = this.catName(c), t = this.txt[c.id] || {acc: nm.toLowerCase(), text: ''};
    return {h1: `${nm} б/у из Европы — Киев${this.ua}`, title: `${nm} б/у из Европы — купить в Киеве${this.ua} | ${this.shop}`,
      desc: `Купить ${t.acc} из Европы: ${n} в наличии${from}${br}. Проверенные, гарантия 3 месяца. ${this.addr} (${this.hint})${this.orUa}.`,
      h2: `Купить ${t.acc} ${this.inKyiv}`, text: t.text};
  },
  facts: (n, min, brands, addr, hint, hours) => `Сейчас в наличии ${RUL.goods(n)}${min ? `, цены от ${money(min)} грн` : ''}.${brands.length ? ` Бренды: ${brands.join(', ')}.` : ''} На каждую единицу — гарантия 3 месяца. Посмотреть и проверить вживую можно в магазине: ${addr} (${hint}), ежедневно ${hours}.${TXT.DELIVERY ? ' Отправляем по всей Украине — напишите в Telegram или Viber, и договоримся о доставке.' : ''}`,
  lead: (n, addr, hours) => `${RUL.goods(n)} в наличии. Вся техника — из Европы, проверена перед продажей, с гарантией. Посмотреть вживую: ${addr}, ежедневно ${hours}.`,
  filters: 'Открыть с фильтрами', fromEU: 'из Европы', forPrice: 'за', warranty: 'гарантия', Warranty: 'Гарантия', look: 'Посмотреть',
  ask: 'Добрый день! Интересует', photo: 'фото', isNew: 'Новая', isUsed: 'Б/у', reserved: 'Забронировано', inStock: 'В наличии',
  write: 'Написать в Telegram', askAll: 'По всем вопросам пишите:', open: 'Открыть в каталоге', switchTo: 'uk', switchLabel: 'Українською',
};
const LANGS = [UK, RUL];
const BY = {uk: UK, ru: RUL};

// Адреса однієї й тієї самої сторінки різними мовами: ключ 'home' | 'cat:<id>' | 'p:<файл>'.
const rel = (L, key) => L.base + (key === 'home' ? '' : key.startsWith('cat:') ? `katalog/${L.slug[key.slice(4)]}/` : `tovar/${key.slice(2)}`);
const urlOf = (L, key) => SITE + rel(L, key);
// Той самий скрипт вибору мови, що й у index.html (там він написаний вручну): беремо його звідти.
const LANGJS = (html.match(/<script>\/\* Мова:[\s\S]*?<\/script>/) || [''])[0];
if (!LANGJS) throw new Error('index.html: не знайшов скрипт вибору мови');
const langjs = (here, to) => LANGJS.replace(/var H='uk',P='[^']*'/, `var H='${here}',P='${to}'`);
const alternates = key => LANGS.map(L => `<link rel="alternate" hreflang="${L.code}" href="${urlOf(L, key)}">`).join('\n') +
  `\n<link rel="alternate" hreflang="x-default" href="${urlOf(UK, key)}">`;

const COUNT = {};
for (const c of CATS) COUNT[c.id] = ALL.filter(p => inCat(p, c.id)).length;
const CATLIST = CATS.filter(c => SLUG[c.id] && COUNT[c.id]);

function page(L, {key, title, desc, image, up, body, json}) {
  const canon = urlOf(L, key), other = BY[L.switchTo];
  // Перемикач мови: на українських сторінках — скромне посилання внизу, на російських — ще й «UA» вгорі.
  const sw = `<a class="lang" href="${up}${rel(other, key)}" hreflang="${other.code}" lang="${other.code}" data-lang="${other.code}">${L.switchLabel}</a>`;
  return `<!doctype html>
<html lang="${L.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
${alternates(key)}
${langjs(L.code, up + rel(other, key))}
<meta property="og:type" content="website">
<meta property="og:locale" content="${L.locale}">
<meta property="og:site_name" content="${esc(L.shop)}">
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
<header class="header"><a class="logolink" href="${up}${L.base}" aria-label="${L.toHome}"><svg class="logo" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="12" width="24" height="31" rx="3"/><path d="M4 19h24M8 15.5h5M22 15.5h2"/><circle cx="16" cy="31" r="7"/><path d="M12.5 31.5c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0"/><rect x="31" y="5" width="13" height="38" rx="2.5"/><path d="M31 18h13M34.5 9.5v4M34.5 22v6"/></svg></a><a class="shop" href="${up}${L.base}">${L.logo}</a><span class="hlang"><a href="${up}${rel(other, key)}" hreflang="${other.code}" lang="${other.code}" data-lang="${other.code}" title="${L.switchLabel}">${other.code === 'uk' ? 'UA' : 'RU'}</a></span></header>
${body}
<footer class="footer">
  <p><b>${esc(L.shop)}</b> — ${L.about}</p>
  <p>${esc(L.addr)} (${esc(L.hint)}) · ${esc(L.hours)} · <a href="${esc(SHOP.mapUrl)}" target="_blank" rel="noopener">${L.map}</a></p>
  <div class="askrow"><p class="ask">${L.askAll}</p>
  <p class="btns"><a class="btn tg" href="https://t.me/${SHOP.tg}" target="_blank" rel="noopener" data-track="click-telegram"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M21.4 4.2 2.9 11.3c-1.1.4-1.1 1.1-.2 1.4l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.6zM9.6 14.4l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.2z"/></svg>Telegram</a><a class="btn vb" href="viber://chat?number=%2B${SHOP.viber}" data-track="click-viber"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8c5 0 8.6 2.4 8.6 8.2s-3.6 8-8.6 8c-.9 0-1.8-.1-2.6-.3L6 21v-3.2C4.2 16.4 3.4 14.2 3.4 11 3.4 5.2 7 2.8 12 2.8z"/><path d="M9.2 7.6c.4-.2.8 0 1 .4l.6 1.3c.1.3 0 .6-.2.8l-.4.4c.4 1 1.3 1.9 2.3 2.3l.4-.4c.2-.2.5-.3.8-.2l1.3.6c.4.2.6.6.4 1-.4 1-1.4 1.5-2.4 1.1-2.2-.8-3.9-2.5-4.7-4.7-.4-1 .1-2 .9-2.6z" fill="currentColor" stroke="none"/></svg>Viber</a></p></div>
  <nav class="cats" aria-label="${L.sections}"><b>${L.sectionsShort}</b>${CATLIST.map(c => `<a href="${up}${L.base}katalog/${L.slug[c.id]}/">${esc(L.catName(c))}</a>`).join('')}</nav>
  <p class="langs">${sw}</p>
</footer>
</div>
<script>document.addEventListener('click', e => { const a = e.target.closest('[data-track]'); if (a) try { window.goatcounter?.count?.({path: a.dataset.track, title: document.title, event: true}); } catch {} });</script>
</body>
</html>
`;
}

const state = (L, p) => p.isNew ? (L.fem.has(p.cat) ? L.newF : L.newM) : L.used;
const card = (L, p, up) => `<li><a class="card" href="${up}${L.base}tovar/${file(p)}">
  <span class="ph">${p.photos[0] ? `<img src="${esc(src(p.photos[0], up))}" alt="${esc(name(p) || L.one[p.cat])}" loading="lazy" decoding="async">` : ''}${p.oldPrice && p.price ? `<span class="off">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ''}</span>
  ${p.price ? `<span class="price">${money(p.price)} <small>грн</small></span>` : ''}
  <span class="nm"><b>${esc(p.brand)}</b> ${esc(p.model)}</span>
  <span class="sub">${esc(L.one[p.cat])}, ${state(L, p)} · ID ${esc(p.id)}</span></a></li>`;

const out = new Map();  // шлях → вміст
const urls = [];        // [ключ сторінки, дата]

for (const c of CATLIST) {
  const items = ALL.filter(p => inCat(p, c.id)), key = 'cat:' + c.id, prices = items.filter(p => p.price).map(p => p.price), min = prices.length ? Math.min(...prices) : 0;
  // Бренди, яких у розділі найбільше (люди часто шукають «Bosch б/у», «Miele з Німеччини»).
  const bc = {};
  for (const p of items) if (p.brand && !/^\d/.test(p.brand)) bc[p.brand] = (bc[p.brand] || 0) + 1;
  const brands = Object.entries(bc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  urls.push([key, day(items[0]?.date)]);
  for (const L of LANGS) {
    const t = L.catText(c, items.length, min, brands), up = L.base ? '../../../' : '../../', canon = urlOf(L, key);
    const body = `<main>
<nav class="crumbs"><a href="${up}${L.base}">${L.home}</a> › <span>${esc(L.catName(c))}</span></nav>
<h1>${esc(t.h1)}</h1>
<p class="lead">${esc(L.lead(items.length, L.addr, L.hours.replace(/, без вих\S+/, '')))}</p>
<p><a class="btn primary" href="${up}${L.base}?cat=${c.id}">${L.filters}</a></p>
<ul class="grid">${items.map(p => card(L, p, up)).join('')}</ul>
<section class="about">
<h2>${esc(t.h2)}</h2>
${t.text ? `<p>${esc(t.text)}</p>` : ''}
<p>${esc(L.facts(items.length, min, brands, L.addr, L.hint, L.hours.replace(/, без в[иы]х\S+/, '')))}</p>
</section>
</main>`;
    out.set(rel(L, key) + 'index.html', page(L, {key, title: t.title, desc: t.desc, up, body, json: [
      {'@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        {'@type': 'ListItem', position: 1, name: L.home, item: urlOf(L, 'home')}, {'@type': 'ListItem', position: 2, name: L.catName(c), item: canon}]}]}));
  }
}

for (const p of ALL) {
  const c = CAT[p.cat], nm = name(p), key = 'p:' + file(p);
  urls.push([key, day(p.date)]);
  for (const L of LANGS) {
    const up = L.base ? '../../' : '../', canon = urlOf(L, key), one = L.one[p.cat], cname = L.catName(c);
    const head = `${one} ${nm || 'ID ' + p.id}`;
    const title = `${head} ${state(L, p)}${p.price ? ` — ${money(p.price)} грн` : ''}, ${L.kyiv} | ${L.shop}`;
    const warr = L.tr(p.warrantyText);
    const facts = [L.tr(p.chips.join(', ')), warr && `${L.warranty} ${warr}`].filter(Boolean).join('; ');
    const desc = `${head} ${state(L, p)} ${L.fromEU}${p.price ? ` ${L.forPrice} ${money(p.price)} грн` : ''}${facts ? ` (${facts})` : ''}. ID ${p.id}. ${L.look}: ${L.addr}${L.orUa}.`;
    const text = L.tr(p.text).split('\n').map(l => l.trim()).filter(Boolean).map(esc).join('<br>');
    const ask = `${L.ask} ID ${p.id}, ${nm}${p.price ? `, ${money(p.price)} грн` : ''}`;
    const body = `<main class="product">
<nav class="crumbs"><a href="${up}${L.base}">${L.home}</a> › ${SLUG[p.cat] ? `<a href="${up}${L.base}katalog/${L.slug[p.cat]}/">${esc(cname)}</a>` : esc(cname)} › <span>ID ${esc(p.id)}</span></nav>
<div class="pgrid">
<div class="photos">${p.photos.map((ph, i) => `<img src="${esc(src(ph, up))}" alt="${esc(nm || one)}, ${L.photo} ${i + 1}" ${i ? 'loading="lazy" ' : ''}decoding="async">`).join('')}</div>
<div class="pinfo">
<h1><span>${esc(one)}</span> ${esc(nm || 'ID ' + p.id)}</h1>
${p.price ? `<p class="price big">${money(p.price)} <small>грн</small>${p.oldPrice ? ` <s>${money(p.oldPrice)} грн</s>` : ''}</p>` : ''}
<p class="sub">ID ${esc(p.id)} · ${p.isNew ? L.isNew : L.isUsed} · ${p.reserved ? L.reserved : L.inStock}${warr ? ` · ${L.Warranty} ${esc(warr)}` : ''}</p>
<p class="btns"><a class="btn primary" href="https://t.me/${SHOP.tg}?text=${encodeURIComponent(ask)}" target="_blank" rel="noopener" data-track="click-telegram"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M21.4 4.2 2.9 11.3c-1.1.4-1.1 1.1-.2 1.4l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.6zM9.6 14.4l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.2z"/></svg>${L.write}</a><a class="btn vb" href="viber://chat?number=%2B${SHOP.viber}" data-track="click-viber"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8c5 0 8.6 2.4 8.6 8.2s-3.6 8-8.6 8c-.9 0-1.8-.1-2.6-.3L6 21v-3.2C4.2 16.4 3.4 14.2 3.4 11 3.4 5.2 7 2.8 12 2.8z"/><path d="M9.2 7.6c.4-.2.8 0 1 .4l.6 1.3c.1.3 0 .6-.2.8l-.4.4c.4 1 1.3 1.9 2.3 2.3l.4-.4c.2-.2.5-.3.8-.2l1.3.6c.4.2.6.6.4 1-.4 1-1.4 1.5-2.4 1.1-2.2-.8-3.9-2.5-4.7-4.7-.4-1 .1-2 .9-2.6z" fill="currentColor" stroke="none"/></svg>Viber</a></p>
<p class="desc">${text}</p>
<p><a href="${up}${L.base}?p=${encodeURIComponent(p.id)}">${L.open}</a></p>
</div>
</div>
</main>`;
    const product = {'@context': 'https://schema.org', '@type': 'Product', name: `${one} ${nm}`.trim(), sku: p.id, category: cname,
      ...(p.brand && {brand: {'@type': 'Brand', name: p.brand}}), ...(p.model && {model: p.model}),
      ...(p.photos.length && {image: p.photos.map(x => src(x, SITE))}), description: L.tr(p.text).slice(0, 500),
      ...(p.price && {offers: {'@type': 'Offer', url: canon, price: p.price, priceCurrency: 'UAH',
        itemCondition: p.isNew ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
        availability: p.reserved ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock', seller: {'@id': SITE + '#shop'}}})};
    out.set(rel(L, key), page(L, {key, title, desc, image: p.photos[0] && src(p.photos[0], SITE), up, body, json: [product, {'@context': 'https://schema.org', ...STORE}]}));
  }
}

// Російська головна (ru/) — повний каталог: копія index.html з перекладеним інтерфейсом.
// Фрагменти для заміни — у scripts/ru-app.tsv; розбір дописів не чіпаємо (там регулярки на українські слова).
{
  const pairs = fs.readFileSync(path.join(ROOT, 'scripts/ru-app.tsv'), 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));
  const a = html.indexOf('/* ---------- розбір допису з Telegram'), b = html.indexOf('/* ---------- пошук:');
  let head = html.slice(0, a), tail = html.slice(b);
  const middle = html.slice(a, b);
  const missed = [];
  for (const [uk, ru] of pairs) {
    if (!head.includes(uk) && !tail.includes(uk)) { missed.push(uk); continue; }
    head = head.split(uk).join(ru); tail = tail.split(uk).join(ru);
  }
  if (missed.length) console.warn(`ru/index.html: не знайшов у index.html ${missed.length} фрагм.:\n  ` + missed.join('\n  '));
  // Назви розділів і переклад характеристик — під час роботи сторінки (CATS потрібні розбору дописів українською).
  const boot = `/* ---------- російська версія (цей файл генерує scripts/seo.mjs з index.html — правте index.html) ---------- */
const RU_CAT = ${JSON.stringify(Object.fromEntries(CATS.map(c => [c.id, {name: RU.NAME[c.id] || c.name, short: RU.SHORT[c.id] || c.short, ...(c.one && {one: RU.ONE[c.id] || c.one})}])))};
for (const c of CATS) { const r = RU_CAT[c.id]; c.terms = [...c.terms, c.name.toLowerCase(), r.name.toLowerCase()]; Object.assign(c, r); }
Object.assign(SLUG, ${JSON.stringify(RU.SLUG)});
const RU_WORDS = ${JSON.stringify(RU.WORDS)};
const TRL = ${RU.tr.toString().replace('WORDS[', 'RU_WORDS[')};

`;
  const at = head.indexOf('/* ---------- іконки');
  head = head.slice(0, at) + boot + head.slice(at);
  const TITLE = `Б/у бытовая техника из Европы — Киев${RUL.ua} | ${RUL.shop}`;
  const DESC = `Б/у бытовая техника из Германии и Европы: стиральные и сушильные машины, холодильники, посудомойки, плиты, духовки, кофемашины, телевизоры, тренажеры. Проверенная, гарантия 3 месяца. ${RUL.addr} (${RUL.hint}), ежедневно 10:00–19:00.${TXT.DELIVERY ? ' Доставка по Украине.' : ''}`;
  head = head.replace('<html lang="uk">', '<html lang="ru">')
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="../">')
    .replace('<a class="logolink" href="./" data-home', '<a class="logolink" href="ru/" data-home')  // з <base href="../"> «./» вело б на українську головну
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(DESC)}">`)
    .replace('<link rel="canonical" href="https://techika.com.ua/">', `<link rel="canonical" href="${SITE}ru/">`)
    .replace('content="uk_UA"', 'content="ru_UA"')
    .replace(/<meta property="og:site_name" content="[^"]*">/, `<meta property="og:site_name" content="${esc(RUL.shop)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(TITLE)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(DESC)}">`)
    .replace(`<meta property="og:url" content="${SITE}">`, `<meta property="og:url" content="${SITE}ru/">`);
  out.set('ru/index.html', head + middle + tail);
}

// Записуємо лише змінене; сторінки проданих товарів і порожніх розділів прибираємо (обома мовами).
let wrote = 0, removed = 0;
for (const [rel, s] of out) {
  const f = path.join(ROOT, rel);
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === s) continue;
  fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, s); wrote++;
}
for (const base of ['', 'ru/']) {
  const tdir = path.join(ROOT, base + 'tovar');
  for (const f of fs.existsSync(tdir) ? fs.readdirSync(tdir) : []) if (!out.has(base + 'tovar/' + f)) { fs.rmSync(path.join(tdir, f)); removed++; }
  const kdir = path.join(ROOT, base + 'katalog');
  for (const d of fs.existsSync(kdir) ? fs.readdirSync(kdir, {withFileTypes: true}) : [])
    if (d.isDirectory() && !out.has(`${base}katalog/${d.name}/index.html`)) { fs.rmSync(path.join(kdir, d.name), {recursive: true}); removed++; }
}

// sitemap: кожна сторінка обома мовами, з посиланнями на переклад (так Google радить для багатомовних сайтів).
const newest = urls.map(u => u[1]).filter(Boolean).sort().pop();
const entry = (L, key, d) => `<url><loc>${esc(urlOf(L, key))}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}${LANGS.map(A => `<xhtml:link rel="alternate" hreflang="${A.code}" href="${esc(urlOf(A, key))}"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${esc(urlOf(UK, key))}"/></url>`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.flatMap(L => [['home', newest], ...urls].map(([k, d]) => entry(L, k, d))).join('\n')}
</urlset>
`;
const sm = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(sm) || fs.readFileSync(sm, 'utf8') !== sitemap) fs.writeFileSync(sm, sitemap);
console.log(`seo: ${out.size} сторінок (записано ${wrote}, прибрано ${removed}), ${ALL.length} товарів, мови: ${LANGS.map(L => L.code).join(', ')}`);
