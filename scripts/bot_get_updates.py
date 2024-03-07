import requests, json
from common import *
from wrangler_common import *

def do_it():
    bot_token = get_var_from_dev_vars("TELEGRAM_BOT_TOKEN")
    url = f'{LOCAL_TELEGRAM_BOT_API_SERVER_ADDRESS}/bot{bot_token}/getUpdates'
    response = requests.get(url)
    print(json.dumps(json.loads(response.text), indent = 1))

if __name__ == "__main__":
    do_it()