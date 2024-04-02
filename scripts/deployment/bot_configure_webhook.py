import json
import requests
from wrangler_common import determine_workers_url, get_secret, make_telegram_api_method_url


def configure_webhook(env : str):
    webhook_secret_token = get_secret("SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN", env)
    webhook_url = determine_workers_url(env)
    data = {
        'url': webhook_url,
        'secret_token': webhook_secret_token,
        'max_connections': 100,
        'allowed_updates': ['message', 'inline_query', 'chosen_inline_result', 'callback_query']
    }
    headers = {
        "Content-Type": "application/json"
    }
    request_url = make_telegram_api_method_url('setWebhook', env)
    response = requests.post(request_url, data=json.dumps(data), headers = headers)
    print_response(response)
    if (not response.ok):
        raise Exception("Failed to set webhook")

def print_response(response):
    print("\n**Response**:", response)
    print("\n**Headers**:", json.dumps(dict(response.headers), indent = 1))
    if response.headers['Content-Type'].startswith("application/json"):
        print("\n**Content**:", json.dumps(json.loads(response.content.decode('utf-8')), indent = 1))
    else:
        print("\n**Content**:", response.content)
