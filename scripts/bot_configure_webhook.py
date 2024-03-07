import json
from argparse import ArgumentParser, Namespace
import requests
from requests_toolbelt.multipart.encoder import MultipartEncoder

# Sets up the bot webhook

# pip install requests
# pip install requests-toolbelt

def parse_args():
    #parser = ArgumentParser()
    #parser.add_argument("--bot_token", required = True, type=str)
    #parser.add_argument("--webhook_url", required = True, type=str)
    #return parser.parse_args()
    bot_token = input("Enter the bot token:").strip()
    webhook_url = input("Enter the webhook URL:").strip()
    webhook_secret_token = input("Enter the webhook secret token:").strip()
    return Namespace(bot_token = bot_token, webhook_url = webhook_url, webhook_secret_token = webhook_secret_token)

def do_it(args):
    bot_token = args.bot_token.strip()
    webhook_url = args.webhook_url.strip()
    webhook_secret_token = args.webhook_secret_token.strip()
    request_url = f'https://api.telegram.org/bot{bot_token}/setWebhook'
    """multipart_data = MultipartEncoder(
        fields={
            'url': webhook_url,
            'secret_token': webhook_secret_token,
            'allowed_updates': ['callback_query']
        }
    )
    response = requests.post(request_url, data=multipart_data, headers={'Content-Type': multipart_data.content_type})
    """
    data = {
        'url': webhook_url,
        'secret_token': webhook_secret_token,
        'allowed_updates': ['message', 'inline_query', 'chosen_inline_result', 'callback_query']
    }
    headers = {
        "Content-Type": "application/json"
    }
    response = requests.post(request_url, data=json.dumps(data), headers = headers)
    if (not response.ok):
        print(response.data)
    print_response(response)

def print_response(response):
    print("\n**Response**:", response)
    print("\n**Headers**:", json.dumps(dict(response.headers), indent = 1))
    if response.headers['Content-Type'].startswith("application/json"):
        print("\n**Content**:", json.dumps(json.loads(response.content.decode('utf-8')), indent = 1))
    else:
        print("\n**Content**:", response.content)

if __name__ == "__main__":
    args = parse_args()
    do_it(args)