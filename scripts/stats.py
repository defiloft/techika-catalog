"""Забирає статистику з GoatCounter і зберігає у stats/stats.json.

Потрібно: на goatcounter.com у Settings увімкнути
«Allow adding visitor counts on your website» (тоді лічильники доступні без пароля).
"""
import datetime as dt
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

CODE = os.environ.get("GC_CODE", "techika-catalog")
PATHS = {"visits": "/", "telegram": "click-telegram", "viber": "click-viber"}


def count(path, start, end):
    url = (f"https://{CODE}.goatcounter.com/counter/{urllib.parse.quote(path, safe='')}.json"
           f"?start={start}&end={end}")
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:  # ще не було жодного відвідування/кліку
            return 0
        raise
    return int(re.sub(r"\D", "", str(data.get("count", "0"))) or 0)


def period(start, end):
    return {k: count(p, start, end) for k, p in PATHS.items()} | {"start": str(start), "end": str(end)}


today = dt.datetime.now(ZoneInfo("Europe/Kyiv")).date()
y = today - dt.timedelta(days=1)
out = {
    "updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
    "yesterday": period(y, y),
    "last7": period(today - dt.timedelta(days=7), y),
    "last30": period(today - dt.timedelta(days=30), y),
}
os.makedirs("stats", exist_ok=True)
json.dump(out, open("stats/stats.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False))
