"""Тимчасово: показує будову групи «запит фото і наявність» (без тексту повідомлень)."""
import asyncio, os, re
from telethon import TelegramClient
from telethon.sessions import StringSession

async def main():
    c = TelegramClient(StringSession(os.environ["TG_SESSION"]), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"])
    await c.connect()
    found = []
    async for d in c.iter_dialogs(limit=400):
        t = (d.name or "").lower()
        if "запит" in t or "наявн" in t or "фото" in t:
            found.append(d)
            print("DIALOG", repr(d.name), d.id, type(d.entity).__name__, "megagroup=", getattr(d.entity, "megagroup", None), "forum=", getattr(d.entity, "forum", None))
    for d in found[:3]:
        n = 0
        async for m in c.iter_messages(d.entity, limit=400):
            txt = m.message or ""
            ids = re.findall(r"\d{5,7}", txt)
            rt = m.reply_to
            print("M", m.id, m.date.strftime("%m-%d %H:%M"), "reply", getattr(rt, "reply_to_msg_id", None),
                  "top", getattr(rt, "reply_to_top_id", None), "grp", m.grouped_id,
                  "photo" if m.photo else ("doc:" + (m.document.mime_type or "") if m.document else "-"),
                  "fwd" if m.fwd_from else "", "len", len(txt), "hasID", bool(re.search(r"\bID", txt, re.I)), "nums", ids[:3],
                  "from", "out" if m.out else "other")
            n += 1
        print("TOTAL", n)
    await c.disconnect()

asyncio.run(main())
