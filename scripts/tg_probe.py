"""Тимчасово: шукає групу/тему «запит фото і наявність» (друкує лише будову, без тексту повідомлень)."""
import asyncio, os, re
from telethon import TelegramClient, functions
from telethon.sessions import StringSession

KEYS = ("запит", "запрос", "наявн", "наличи", "фото", "zapyt", "foto")
lat = str.maketrans("aceiopxyKkMHTB", "асеіорхуКкМНТВ")
norm = lambda s: (s or "").translate(lat).casefold()

async def topics(c, ent):
    for mod in (functions.channels, functions.messages):
        req = getattr(mod, "GetForumTopicsRequest", None)
        if not req:
            continue
        try:
            kw = dict(offset_date=None, offset_id=0, offset_topic=0, limit=100)
            r = await c(req(channel=ent, **kw)) if mod is functions.channels else await c(req(peer=ent, **kw))
            return r.topics
        except Exception as e:
            print("  topics err", type(e).__name__, e)
    return []

async def main():
    c = TelegramClient(StringSession(os.environ["TG_SESSION"]), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"])
    await c.connect()
    me = await c.get_me()
    print("ME premium", getattr(me, "premium", None), "bot", me.bot)
    hits = []
    async for d in c.iter_dialogs():
        e = d.entity
        if not (d.is_group or getattr(e, "forum", False)):
            continue
        print("GROUP", d.id, "forum", getattr(e, "forum", None), "match", any(k in norm(d.name) for k in KEYS), "unread", d.unread_count)
        if getattr(e, "forum", False):
            for t in await topics(c, e):
                tt = getattr(t, "title", "")
                if any(k in norm(tt) for k in KEYS):
                    print("  TOPIC", t.id, repr(tt))
                    hits.append((e, t.id))
        if any(k in norm(d.name) for k in KEYS):
            print("  NAME", repr(d.name))
            hits.append((e, None))
    for e, tid in hits[:2]:
        n = 0
        async for m in c.iter_messages(e, limit=300, reply_to=tid):
            txt = m.message or ""
            rt = m.reply_to
            print("M", m.id, m.date.strftime("%m-%d %H:%M"), "reply", getattr(rt, "reply_to_msg_id", None),
                  "grp", m.grouped_id, "photo" if m.photo else ("doc" if m.document else "-"),
                  "fwd" if m.fwd_from else "", "len", len(txt), "ID", re.findall(r"\b\d{6}\b", txt)[:3])
            n += 1
        print("TOTAL", n)
    await c.disconnect()

asyncio.run(main())
