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
import asyncio, os, time
from pathlib import Path

MAX_MSGS = 500    # скільки останніх дописів читати з кожного приватного каналу
MAX_PHOTOS = 3     # фото на товар (кожне ~80 КБ зберігається в репозиторії)
BUDGET = 15 * 60  # секунд на один запуск; що не встигли, дочитаємо наступного разу
ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "img" / "tg"


def configured():
    return all(os.environ.get(k) for k in ("TG_API_ID", "TG_API_HASH", "TG_SESSION"))


def fetch(invites, extract_post):
    """invites: {hash: хаб}; extract_post(text, id) → dict або None. Повертає (товари, {chat_id: ok}) або None, якщо вхід не вдався."""
    try:
        return asyncio.run(asyncio.wait_for(_fetch(invites, extract_post, time.monotonic() + BUDGET), BUDGET + 600))
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


async def _fetch(invites, extract_post, deadline):
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
        return items, status
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


def cleanup(products):
    """Видаляє фото дописів, яких більше немає в каталозі."""
    keep = {i for p in products for i in p.get("images", [])}
    if not IMG.exists():
        return
    for f in IMG.rglob("*.jpg"):
        if f.relative_to(ROOT).as_posix() not in keep:
            f.unlink()
    for d in IMG.iterdir():
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
