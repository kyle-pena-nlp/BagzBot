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
    return Namespace(bot_token = bot_token)

def do_it(args):
    bot_token = args.bot_token.strip()
    #request_url = f'https://api.telegram.org/bot{bot_token}/deleteWebhook'
    #response = requests.post(request_url)
    #print_response(response)
    print("Not executing request.  Uncomment in code to do it for real.  THINK CAREFULLY. LOOK FOR ALTERNATIVES.")

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