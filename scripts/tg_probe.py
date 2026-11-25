"""Тимчасово: шукає ID товарів без додаткових фото по всій робочій групі (друкує лише шаблони, без тексту)."""
import asyncio, json, os, re, collections, random
from telethon import TelegramClient
from telethon.sessions import StringSession
import tg_private as T

def pat(s, pid):
    s = (s or "").replace(pid, "<ID>")
    s = re.sub(r"\d", "9", s); s = re.sub(r"[а-яіїєґА-ЯІЇЄҐ]+", "w", s); s = re.sub(r"[a-zA-Z]{3,}", "L", s)
    return s.replace("\n", "⏎")[:50]

async def main():
    c = TelegramClient(StringSession(os.environ["TG_SESSION"]), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"], flood_sleep_threshold=120)
    await c.connect()
    prods = json.load(open("../products.json"))["products"]
    miss = sorted({p["pid"] for p in prods if T.has_id(p) and not p.get("extra")})
    print("missing", len(miss))
    chat, topic = await T._req_topic(c)
    random.seed(1); sample = random.sample(miss, min(80, len(miss)))
    found, tops, kinds, pats = 0, collections.Counter(), collections.Counter(), collections.Counter()
    for pid in sample:
        hits = {}
        for q in (pid, "ID" + pid, "id " + pid):
            async for m in c.iter_messages(chat, search=q, limit=20):
                if pid in re.sub(r"\D", "", m.message or "") or pid in (m.message or ""):
                    hits[m.id] = m
            await asyncio.sleep(1)
        if hits:
            found += 1
        for m in hits.values():
            rt = m.reply_to
            t = getattr(rt, "reply_to_top_id", None) or getattr(rt, "reply_to_msg_id", None) or 0
            tops["req" if t == topic else f"topic{t}"] += 1
            kinds["photo" if m.photo else "video" if m.document else "text"] += 1
            pats[pat(m.message, pid)] += 1
        print("ID", pid[-2:], "hits", len(hits), sorted({(getattr(m.reply_to, 'reply_to_top_id', None) or getattr(m.reply_to, 'reply_to_msg_id', None) or 0) == topic for m in hits.values()}), [m.date.date().isoformat() for m in list(hits.values())[:3]])
    print("sample", len(sample), "found anywhere", found)
    print("topics", tops.most_common(10)); print("kinds", kinds.most_common())
    for k, v in pats.most_common(20): print("PAT", v, repr(k))
    await c.disconnect()

asyncio.run(main())
