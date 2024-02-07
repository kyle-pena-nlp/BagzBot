import json
from argparse import ArgumentParser, Namespace
import requests
from requests_toolbelt.multipart.encoder import MultipartEncoder
from common import *
from wrangler_common import *

# Tests the webhook.

# pip install requests
# pip install requests-toolbelt

def parse_args():
    #parser = ArgumentParser()
    #parser.add_argument("--webhook_url", required = True, type=str)
    #return parser.parse_args()
    #bot_token = input("Enter the bot token:").strip()
    #webhook_url = input("Enter the webhook URL:").strip()
    #webhook_secret_token = input("Enter the webhook secret token:").strip()
    #return Namespace(bot_token = bot_token, webhook_url = webhook_url, webhook_secret_token = webhook_secret_token)
    return Namespace(env="DEV")

def get_bot_info(args):
    webhook_secret_token = get_var_from_dev_vars("TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN")    
    return Namespace(webhook_secret_token = webhook_secret_token)

def do_it(args):
    bot_info = get_bot_info(args)
    webhook_url = LOCAL_CLOUDFLARE_WORKER_URL
    webhook_secret_token = bot_info.webhook_secret_token.strip()
    data = {
        "update_id": 10000,
        "message": {
            "date": 1441645532,
            "chat": {
                "last_name": "Test Lastname",
                "type": "private",
                "id": 1111111,
                "first_name": "Test Firstname",
                "username": "Testusername"
            },
            "message_id": 1365,
            "from": {
                "last_name": "Test Lastname",
                "id": 1111111,
                "first_name": "Test Firstname",
                "username": "Testusername"
            },
            "text": "/start",
            "reply_to_message": {
                "date": 1441645000,
                "chat": {
                    "last_name": "Reply Lastname",
                    "type": "private",
                    "id": 1111112,
                    "first_name": "Reply Firstname",
                    "username": "Testusername"
                },
                "message_id": 1334,
                "text": "Original"
            }
        }
    }

    # Setting the headers
    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Telegram-Bot-Api-Secret-Token": webhook_secret_token
    }

    # Making a POST request
    response = requests.post(webhook_url, headers=headers, data=json.dumps(data))

    print_response(response)


def print_response(response):
    print("\n**Response**:", response)
    print("\n**Headers**:", json.dumps(dict(response.headers), indent = 1))
    if response.headers['Content-Type'].startswith("application/json"):
        print("\n**Content**:", json.dumps(response.content, indent = 1))
    else:
        print("\n**Content**:", response.content)

if __name__ == "__main__":
    args = parse_args()
    do_it(args)