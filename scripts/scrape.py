#!/usr/bin/env python3
"""Збирає товари з публічних Telegram-каналів (t.me/s/...) у products.json.
Видалений в Telegram допис зникає з products.json при наступному запуску."""
import html, json, re, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

CHANNELS = {
    "holodylnyky_ta_morozylni_kamery": "Холодильники",
    "pralni_sushylni_mashyny": "Пральні та сушильні",
    "plyty_gas_electro": "Плити",
    "posudomyini_mashyny": "Посудомийки",
    "duhovi_shafy_varylni_poverhni": "Духові та варильні",
    "vytiazhky": "Витяжки",
    "kavomashyny": "Кавомашини",
    "smart_tv_domfort": "Телевізори",
    "sportyvni_trenagery": "Тренажери",
}
MAX_PAGES = 40  # ~20 дописів на сторінку
OUT = Path(__file__).resolve().parent.parent / "products.json"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; shop-sync/1.0)"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")


def clean(h):
    h = re.sub(r"<br\s*/?>", "\n", h)
    return html.unescape(re.sub(r"<[^>]+>", "", h)).strip()


def price_of(text):
    m = re.search(r"(\d[\d \u00a0.,]*)\s*(?:грн|₴|uah)", text, re.I) or re.search(r"ціна[:\s-]*(\d[\d \u00a0]*)", text, re.I)
    if not m:
        return None
    n = re.sub(r"\D", "", m.group(1))
    return int(n) if n else None


KEYWORDS = ["Крапельна", "Інверторна", "No Frost", "Двокамерна", "Однокамерна", "Вбудована", "Вбудований",
            "Індукційна", "Газова", "Електрична", "Фронтальна", "Вертикальна", "Окремостояча", "Настільна"]


def extract(text, title, pid):
    """Бренд, модель, ID і короткі характеристики з тексту допису (best-effort)."""
    t = re.sub(r"^[^\w]+", "", title)
    t = re.split(r"\s+[-–—|]\s+|\s*(?:ціна|ID)\b", t, flags=re.I)[0].strip() or t
    brand, _, model = t.partition(" ")
    m = re.search(r"\bID[:\s#]*(\d{4,})", text, re.I)
    chips = [k for k in KEYWORDS if k.lower() in text.lower()][:1]
    d = re.search(r"(\d{2,3})\s*[xх×*]\s*(\d{2,3})(?:\s*[xх×*]\s*(\d{2,3}))?\s*(?:см|cm)", text, re.I)
    if d:
        chips.append("×".join(g for g in d.groups() if g) + " см")
    kg = re.search(r"(\d+(?:[.,]\d)?)\s*кг", text, re.I)
    if kg:
        chips.append(kg.group(1).replace(",", ".") + " кг")
    ob = re.search(r"(\d{3,4})\s*(?:об|rpm)", text, re.I)
    if ob:
        chips.append(ob.group(1) + " об")
    return {"brand": brand, "model": model, "pid": m.group(1) if m else str(pid), "chips": chips[:4]}


def parse_page(src, ch):
    items, ids = [], []
    for blk in src.split("tgme_widget_message_wrap")[1:]:
        m = re.search(r'data-post="%s/(\d+)"' % re.escape(ch), blk)
        if not m:
            continue
        pid = int(m.group(1))
        ids.append(pid)
        t = re.search(r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', blk, re.S)
        text = clean(t.group(1)) if t else ""
        imgs = re.findall(r"tgme_widget_message_(?:photo_wrap|video_thumb)[^>]*background-image:url\('([^']+)'\)", blk)
        if not text or not imgs:
            continue
        d = re.search(r'<time[^>]*datetime="([^"]+)"', blk)
        title = next((l.strip() for l in text.splitlines() if l.strip()), "")[:120]
        items.append({"id": f"{ch}/{pid}", "channel": ch, "title": title, "text": text,
                      "price": price_of(text), "images": imgs[:5], "date": d.group(1) if d else "",
                      "url": f"https://t.me/{ch}/{pid}", **extract(text, title, pid)})
    return items, ids


def fetch_channel(ch):
    posts, before = {}, None
    for _ in range(MAX_PAGES):
        src = get(f"https://t.me/s/{ch}" + (f"?before={before}" if before else ""))
        items, ids = parse_page(src, ch)
        if not ids:
            break
        for p in items:
            posts[p["id"]] = p
        nb = min(ids)
        if nb <= 1 or nb == before:
            break
        before = nb
        time.sleep(1)
    return list(posts.values())


def main():
    old = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {"products": []}
    products = []
    for ch in CHANNELS:
        try:
            got = fetch_channel(ch)
        except Exception as e:
            print(f"! {ch}: {e}")
            got = []
        if not got:  # помилка або порожньо: лишаємо попередні дані каналу
            got = [p for p in old.get("products", []) if p["channel"] == ch]
            print(f"~ {ch}: залишено {len(got)} зі старих даних")
        else:
            print(f"+ {ch}: {len(got)}")
        products += got
    products.sort(key=lambda p: p["date"], reverse=True)
    new = {"categories": [{"id": k, "name": v} for k, v in CHANNELS.items()], "products": products}
    if {k: old.get(k) for k in new} != new:
        new["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        OUT.write_text(json.dumps(new, ensure_ascii=False, indent=1), "utf-8")
        print("products.json оновлено")


if __name__ == "__main__":
    main()
