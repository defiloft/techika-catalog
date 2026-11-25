"""Читає ПРИВАТНІ Telegram-канали через акаунт власника магазину (Telethon).

Потрібні секрети репозиторію GitHub (Settings → Secrets and variables → Actions):
  TG_API_ID, TG_API_HASH  — з https://my.telegram.org → API development tools
  TG_SESSION              — рядок входу, який друкує scripts/tg_login.py
Без них сайт просто працює як раніше (лише публічні канали).

Запрошення (t.me/joinchat/... або t.me/+...) скрипт знаходить сам у публічних
каналах-«хабах»; товари з приватного каналу потрапляють у категорію того хабу,
з якого на нього є посилання. Фото зберігаються в img/tg/, бо з приватного
каналу Telegram не віддає публічних посилань на картинки.
"""
import asyncio, os, re, time
from datetime import datetime, timedelta, timezone
from pathlib import Path

MAX_MSGS = 500    # скільки останніх дописів читати з кожного приватного каналу
MAX_PHOTOS = 3     # фото на товар (кожне ~80 КБ зберігається в репозиторії)
BUDGET = 15 * 60  # секунд на один запуск; що не встигли, дочитаємо наступного разу
ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "img" / "tg"


def configured():
    return all(os.environ.get(k) for k in ("TG_API_ID", "TG_API_HASH", "TG_SESSION"))


# Додаткові фото: тема «Запит фото/відео/наявність» у робочій групі магазину. Менеджери кидають туди
# альбом із підписом «ID110376» — ці фото показуємо в галереї товару з тим самим ID.
REQ_TOPIC = ("запит фото", "запрос фото")  # шукаємо тему за назвою
REQ_CHAT, REQ_TOPIC_ID = -1002351969498, 14029  # де вона була 2026-11-25 (щоб не шукати щоразу)
REQ_MSGS = 6000     # скільки останніх повідомлень теми переглядати
REQ_DAYS = 60       # і не старші за стільки днів
MAX_EXTRA = 6       # додаткових фото на товар (кожне ~65 КБ зберігається в репозиторії)
REQ_BUDGET = 8 * 60
REQ_ID = re.compile(r"\bI[DД]\s*[:#№-]?\s*(\d{5,7})\b|^\s*(\d{6})\s*$", re.I | re.M)


def has_id(p):
    """pid — справжній ID з тексту допису, а не номер повідомлення."""
    return p.get("pid", "") in re.findall(r"\bID[:\s#]*(\d{4,})", p.get("text", ""), re.I)


def fetch(invites, extract_post, want=()):
    """invites: {hash: хаб}; extract_post(text, id) → dict або None; want — ID товарів, яким шукати додаткові фото.
    Повертає (товари, {chat_id: ok}, {ID: [фото]} або None) або None, якщо вхід не вдався."""
    try:
        return asyncio.run(asyncio.wait_for(_fetch(invites, extract_post, set(want), time.monotonic() + BUDGET), BUDGET + REQ_BUDGET + 600))
    except Exception as e:  # будь-яка біда з Telegram не повинна ламати публічну частину
        print(f"! приватні канали: {type(e).__name__}: {e}")
        return None


async def _chat_for(client, h):
    from telethon import functions, types, errors
    try:
        r = await client(functions.messages.CheckChatInviteRequest(h))
    except (errors.InviteHashExpiredError, errors.InviteHashInvalidError):
        print(f"  ~ запрошення …{h[-4:]} недійсне")
        return None
    if isinstance(r, (types.ChatInviteAlready, types.ChatInvitePeek)):
        return r.chat
    if getattr(r, "request_needed", False):
        print(f"  ~ «{r.title}»: потрібне схвалення адміністратора, пропускаю")
        return None
    try:
        upd = await client(functions.messages.ImportChatInviteRequest(h))
    except errors.UserAlreadyParticipantError:
        r = await client(functions.messages.CheckChatInviteRequest(h))
        return getattr(r, "chat", None)
    print(f"  + приєднано до «{r.title}»")
    await asyncio.sleep(5)  # не поспішаємо, щоб Telegram не обмежив акаунт
    return upd.chats[0] if upd.chats else None


async def _photo(client, msg, path):
    """Завантажує фото (~800 px) або обкладинку відео. Вже завантажені не чіпаємо."""
    if path.exists():
        return True
    if msg.photo:
        sizes = [s for s in msg.photo.sizes if getattr(s, "type", "") == "x"]
        thumb = sizes[0] if sizes else -1
    elif msg.document and getattr(msg.document, "thumbs", None):
        thumb = -1
    else:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    return bool(await client.download_media(msg, file=str(path), thumb=thumb))


async def _fetch(invites, extract_post, want, deadline):
    from telethon import TelegramClient, errors
    from telethon.sessions import StringSession

    client = TelegramClient(StringSession(os.environ["TG_SESSION"]), int(os.environ["TG_API_ID"]),
                            os.environ["TG_API_HASH"], flood_sleep_threshold=120)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            print("! приватні канали: вхід у Telegram недійсний, створіть новий TG_SESSION (scripts/tg_login.py)")
            return None
        items, status = [], {}
        for h, hub in invites.items():
            if time.monotonic() > deadline:
                print("  ~ час вичерпано, решту каналів прочитаю наступного разу")
                break
            try:
                chat = await _chat_for(client, h)
            except errors.FloodWaitError as e:
                print(f"  ~ Telegram просить зачекати {e.seconds} с, решту каналів прочитаю наступного разу")
                break
            if chat is None or chat.id in status:
                continue
            try:
                got, done = await _read_chat(client, chat, hub, extract_post, deadline)
                status[chat.id] = done  # False — прочитано не все, старі товари каналу лишаємо
                print(f"+ {hub} ← «{chat.title}»: {len(got)}" + ("" if done else " (не все, час вичерпано)"))
                items += got
            except Exception as e:
                status[chat.id] = False
                print(f"! «{getattr(chat, 'title', chat.id)}»: {type(e).__name__}: {e}")
        want |= {p["pid"] for p in items if has_id(p)}
        try:
            extra = await _requests(client, want, time.monotonic() + REQ_BUDGET)
        except Exception as e:
            print(f"! додаткові фото: {type(e).__name__}: {e}")
            extra = None
        return items, status, extra
    finally:
        await client.disconnect()


async def _read_chat(client, chat, hub, extract_post, deadline):
    # Альбом = кілька повідомлень з однаковим grouped_id; текст зазвичай лише в одному з них.
    groups = {}
    async for m in client.iter_messages(chat, limit=MAX_MSGS):
        groups.setdefault(m.grouped_id or ("m", m.id), []).append(m)
    out = []
    for msgs in groups.values():
        if time.monotonic() > deadline:
            return out, False
        msgs.sort(key=lambda m: m.id)
        main = next((m for m in msgs if m.message), None)
        if not main:
            continue
        post = extract_post(main.message, main.id)  # None — реклама/інформаційний допис
        if not post:
            continue
        imgs = []
        for m in msgs:
            if len(imgs) >= MAX_PHOTOS:
                break
            p = IMG / str(chat.id) / f"{m.id}.jpg"
            if await _photo(client, m, p):
                imgs.append(p.relative_to(ROOT).as_posix())
        if not imgs:
            continue
        post.update({"images": imgs, "id": f"{hub}/c{chat.id}_{main.id}", "channel": hub, "chat": chat.id,
                     "date": main.date.isoformat(), "url": f"https://t.me/c/{chat.id}/{main.id}",
                     "from": "", "private": True})
        out.append(post)
    return out, True


async def _req_topic(client):
    """(група, id теми) для «Запит фото/відео/наявність» або None."""
    from telethon import functions
    norm = lambda t: (t or "").casefold()
    async for d in client.iter_dialogs(limit=300):
        e = d.entity
        if not getattr(e, "forum", False):
            continue
        kw = dict(offset_date=None, offset_id=0, offset_topic=0, limit=100)
        req = getattr(functions.messages, "GetForumTopicsRequest", None)  # у старих версіях Telethon — у channels
        r = await client(req(peer=e, **kw) if req else functions.channels.GetForumTopicsRequest(channel=e, **kw))
        ts = [t for t in r.topics if any(k in norm(getattr(t, "title", "")) for k in REQ_TOPIC)]
        if ts:
            t = next((t for t in ts if d.id == REQ_CHAT and t.id == REQ_TOPIC_ID), ts[0])
            return e, t.id
    return None


async def _requests(client, want, deadline):
    """{ID товару: [фото]} з теми запитів; лише для товарів, які є в каталозі. None — тему не знайдено."""
    found = await _req_topic(client)
    if not found:
        print("~ додаткові фото: тему «Запит фото» не знайдено, акаунт має бути в робочій групі")
        return None
    chat, topic = found
    since = datetime.now(timezone.utc) - timedelta(days=REQ_DAYS)
    groups, texts = {}, {}
    async for m in client.iter_messages(chat, limit=REQ_MSGS, reply_to=topic):
        if m.date < since:
            break
        texts[m.id] = m.message or ""
        if m.photo:
            groups.setdefault(m.grouped_id or ("m", m.id), []).append(m)
    out, n = {}, 0
    # Від нових альбомів до старих: свіжі фото важливіші.
    for msgs in sorted(groups.values(), key=lambda g: -max(m.id for m in g)):
        if time.monotonic() > deadline:
            print("  ~ додаткові фото: час вичерпано, решту докачаю наступного разу")
            break
        msgs.sort(key=lambda m: m.id)
        cap = " ".join(m.message or "" for m in msgs)
        if not REQ_ID.search(cap):  # без ID у підписі беремо ID з повідомлення, на яке відповіли
            r = next((m.reply_to for m in msgs if m.reply_to and m.reply_to.reply_to_msg_id != topic), None)
            cap = texts.get(getattr(r, "reply_to_msg_id", None), "") if r else ""
        ids = {a or b for a, b in REQ_ID.findall(cap)} & want
        if len(ids) != 1:  # кілька ID в одному альбомі — не вгадуємо, чиє фото
            continue
        pid = ids.pop()
        have = out.setdefault(pid, [])
        for m in msgs:
            if len(have) >= MAX_EXTRA:
                break
            p = IMG / "req" / f"{m.id}.jpg"
            if await _photo(client, m, p):
                have.append(p.relative_to(ROOT).as_posix())
                n += 1
    print(f"+ додаткові фото: {n} фото для {len(out)} товарів (переглянуто альбомів: {len(groups)})")
    return out


def cleanup(products):
    """Видаляє фото дописів, яких більше немає в каталозі."""
    keep = {i for p in products for i in p.get("images", []) + p.get("extra", [])}
    if not IMG.exists():
        return
    for f in IMG.rglob("*.jpg"):
        if f.relative_to(ROOT).as_posix() not in keep:
            f.unlink()
    for d in IMG.iterdir():
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
