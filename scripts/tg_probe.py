"""Тимчасово: чому частина товарів не отримала фото з теми «Запит фото». Друкує лише шаблони (цифри → 9), без тексту."""
import asyncio, json, os, re, collections
from datetime import datetime, timedelta, timezone
from telethon import TelegramClient
from telethon.sessions import StringSession
import tg_private as T

def pat(s):
    s = re.sub(r"\d", "9", s or "")
    s = re.sub(r"[а-яіїєґА-ЯІЇЄҐ]+", "w", s)
    return s.replace("\n", "⏎")[:40]

async def main():
    c = TelegramClient(StringSession(os.environ["TG_SESSION"]), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"])
    await c.connect()
    prods = json.load(open("../products.json"))["products"]
    ids = {p["pid"] for p in prods if T.has_id(p)}
    have = {p["pid"] for p in prods if p.get("extra")}
    print("catalog with ID", len(ids), "with extra", len(have & ids))
    chat, topic = await T._req_topic(c)
    msgs = []
    async for m in c.iter_messages(chat, limit=40000, reply_to=topic):
        msgs.append(m)
        if m.date < datetime.now(timezone.utc) - timedelta(days=365):
            break
    print("read", len(msgs), "oldest", msgs[-1].date.date(), "6000th", msgs[min(5999, len(msgs)-1)].date.date())
    where = collections.defaultdict(set)  # id -> kinds
    first = {}
    for i, m in enumerate(msgs):
        t = m.message or ""
        for n in set(re.findall(r"(?<!\d)(\d{5,7})(?!\d)", t)):
            if n in ids:
                kind = ("photo" if m.photo else "video" if m.document else "text") + ("+cap" if m.photo and t else "") + ("+reply" if m.reply_to and m.reply_to.reply_to_msg_id != topic else "")
                where[n].add(kind)
                first.setdefault(n, (i, m))
    miss = ids - have
    print("missing", len(miss), "mentioned in topic", len(miss & set(where)))
    print("kinds for missing:", collections.Counter(tuple(sorted(where[n])) for n in miss & set(where)).most_common(15))
    # шаблони підписів для згаданих, але не розпізнаних
    pc = collections.Counter()
    for n in miss & set(where):
        i, m = first[n]
        pc[(pat(m.message), "photo" if m.photo else "video" if m.document else "text", bool(m.grouped_id), m.date < datetime.now(timezone.utc) - timedelta(days=60), i >= 6000)] += 1
    for k, v in pc.most_common(30):
        print("PAT", v, k)
    # що поруч із текстовими згадками: чи йдуть фото одразу після/до
    near = collections.Counter()
    byid = {m.id: m for m in msgs}
    for n in miss & set(where):
        i, m = first[n]
        if m.photo: continue
        nxt = [byid.get(m.id + d) for d in (1, 2, 3, -1, -2)]
        near[tuple("P" if x and x.photo else "V" if x and x.document else "T" if x else "-" for x in nxt)] += 1
    for k, v in near.most_common(10):
        print("NEAR(+1,+2,+3,-1,-2)", v, k)
    # альбоми без розпізнаного ID: шаблони підписів
    ac = collections.Counter()
    groups = collections.defaultdict(list)
    for m in msgs[:6000]:
        if m.photo or m.document: groups[m.grouped_id or m.id].append(m)
    for g in groups.values():
        cap = " ".join(x.message or "" for x in g)
        if not T.REQ_ID.search(cap):
            ac[pat(cap)] += 1
    print("albums no-ID", sum(ac.values()), "of", len(groups))
    for k, v in ac.most_common(15):
        print("NOID", v, repr(k))
    await c.disconnect()

asyncio.run(main())
