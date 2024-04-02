import requests, json

from wrangler_common import get_secret
from start_dev_box import get_local_telegram_bot_api_url


def migrate_telegram_bot_telegram_servers(env):
    _try_log_bot_out_of_local_telegram(env)
    _invoke_getme_on_telegram_servers(env)

def _try_log_bot_out_of_local_telegram(env : str):
    bot_token = get_secret("SECRET__TELEGRAM_BOT_TOKEN", env)
    request_url = get_local_telegram_bot_api_url(bot_token) + "/logOut"
    print(request_url)
    try:
        response = requests.post(request_url)
    except Exception as e:
        print(str(e))
        return
    if response.status_code == 404:
        print(f"Local telegram bot api doesn't appear to be running - got a 404 for {request_url}")
        return
    if not response.ok:
        not_ok_reason = json.loads(response.content.decode()).get("description")
        if not_ok_reason != "Logged out":
            raise Exception(str(response.text))


def _invoke_getme_on_telegram_servers(env : str):
    bot_token = get_secret("SECRET__TELEGRAM_BOT_TOKEN", env)
    telegram_server_getme = f'https://api.telegram.org/bot{bot_token}/getMe'
    response = requests.get(telegram_server_getme, timeout = 5.0)
    if not response.ok:
        print(response.text)
        raise Exception(str(response.text))