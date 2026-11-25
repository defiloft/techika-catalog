"""Тимчасово: скільки товарів без фото знайде пошук по всій групі (лише числа)."""
import asyncio, json, os, time
from telethon import TelegramClient
from telethon.sessions import StringSession
import tg_private as T

async def main():
    c = TelegramClient(StringSession(os.environ["TG_SESSION"]), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"], flood_sleep_threshold=120)
    await c.connect()
    prods = json.load(open("../products.json"))["products"]
    want = {p["pid"] for p in prods if T.has_id(p)}
    idx = json.loads(T.REQ_INDEX.read_text())
    chat, topic = await T._req_topic(c)
    before = len(want & set(idx["ids"]))
    T.SEARCH_PER_RUN = 1000
    t = time.monotonic()
    await T._search_rest(c, chat, topic, want, idx, time.monotonic() + 3600)
    new = (want & set(idx["ids"])) - set()
    print("with photos before", before, "after", len(want & set(idx["ids"])), "of", len(want), "secs", int(time.monotonic() - t))
    print("photos per new id", sorted(len(idx["ids"][p]) for p in want & set(idx["ids"]))[:5])
    await c.disconnect()

asyncio.run(main())
