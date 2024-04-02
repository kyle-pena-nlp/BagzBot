
import json, requests
from argparse import ArgumentParser
from wrangler_common import make_telegram_api_method_url
from commands import COMMANDS

def configure_bot_commands(env : str):

    data = {
        'commands': COMMANDS,
        'scope': {
            'type': 'all_private_chats'
        }
    }
    headers = {
        "Content-Type": "application/json"
    }

    setMyCommands_url = make_telegram_api_method_url("setMyCommands", env)

    response = requests.post(setMyCommands_url, data=json.dumps(data), headers = headers)
    
    if (not response.ok):
        print(response.text)
        raise Exception(response.text)