#!/usr/bin/env python3
"""Одноразовий вхід у Telegram для сайту. Запускати на СВОЄМУ комп'ютері:

    python3 -c "$(curl -fsSL https://raw.githubusercontent.com/defiloft/techika-catalog/main/scripts/tg_login.py)"

Скрипт попросить api_id, api_hash, номер телефону і код з Telegram, а потім
скопіює рядок входу (TG_SESSION) у буфер обміну. Вставте його в GitHub Secrets.
Нікому не надсилайте цей рядок: з ним можна читати ваш Telegram.
"""
import subprocess, sys

try:
    import telethon  # noqa: F401
except ImportError:
    print("Встановлюю бібліотеку telethon…")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "--quiet", "telethon==1.46.0"])
    import site, importlib
    sys.path.append(site.getusersitepackages())
    importlib.invalidate_caches()

from telethon.sync import TelegramClient
from telethon.sessions import StringSession

api_id = int(input("api_id (число з my.telegram.org): ").strip())
api_hash = input("api_hash (з my.telegram.org): ").strip()
with TelegramClient(StringSession(), api_id, api_hash, device_model="Сайт-каталог (GitHub)") as client:
    me = client.get_me()
    session = client.session.save()

try:
    subprocess.run(["pbcopy"], input=session.encode(), check=True)
    print(f"\nГотово, {me.first_name}! Рядок входу СКОПІЙОВАНО в буфер обміну.")
    print("Вставте його (Cmd+V) у GitHub Secrets як TG_SESSION. Нікому його не надсилайте.")
except (OSError, subprocess.CalledProcessError):
    print(f"\nГотово, {me.first_name}! Скопіюйте рядок нижче у GitHub Secrets як TG_SESSION і нікому його не надсилайте:\n")
    print(session)
