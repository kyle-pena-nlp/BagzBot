from argparse import Namespace
import subprocess, json, socket, time, os, signal, shutil
import requests, requests_toolbelt
from wrangler_common import *
from common import *
from typing import List

def run_cloudflare_worker():
    command = START_CLOUDFLARE_LOCAL_WORKER_COMMAND
    print(command)
    child_proc = subprocess.Popen(command, shell = True)
    poll_until_port_is_occupied(LOCAL_CLOUDFLARE_WORKER_PORT)
    return child_proc


def parse_args():
    # NEVER CHANGE THIS because this script takes down the bot and migratres it to the local server
    env = "DEV" # DO NOT CHANGE!
    return Namespace(env = env)

def do_it(args):

    child_procs = []

    try:

        print("Starting local cloudflare worker")
        child_procs.append(run_cloudflare_worker())

        #do_wrangler_login() #This ends up being a pain and most of the time we are already logged in anyway
        #Start a local telegram bot API
        print("Starting local telegram-bot-api server")
        api_id   = get_var_from_dev_vars("TELEGRAM_API_ID")
        api_hash = get_var_from_dev_vars("TELEGRAM_API_HASH")
        child_procs.append(fork_shell_telegram_bot_api_local_server(api_id = api_id, api_hash = api_hash))

        print("Setting up bot locally")
        bot_token = get_var_from_dev_vars("TELEGRAM_BOT_TOKEN")
        bot_secret_token = get_var_from_dev_vars("TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN")
        migrate_and_configure_bot_for_local_server(bot_token, bot_secret_token)

        print("You may wish to start the wrangler debugger now.")

        print("Cloudflare worker and local bot api server ARE RUNNING!")
        print("Press any key to shut them down.")
        wait_for_any_key()
        print("You found the 'any key'!  Bye!")

    except Exception as e:
        print(e)
    finally:
        kill_procs(child_procs)



    # Make sure the local cloudflare worker is running

def fork_shell_telegram_bot_api_local_server(api_id, api_hash):
    shutil.rmtree(TELEGRAM_LOCAL_SERVER_WORKING_DIR, ignore_errors=True)
    os.makedirs(TELEGRAM_LOCAL_SERVER_WORKING_DIR, exist_ok=False)
    command = START_TELEGRAM_LOCAL_SERVER_COMMAND.format(api_id = api_id, api_hash = api_hash, working_dir=TELEGRAM_LOCAL_SERVER_WORKING_DIR)
    print(command)
    child_proc = subprocess.Popen(command,shell = True)
    poll_until_port_is_occupied(LOCAL_TELEGRAM_BOT_API_SERVER_PORT)
    print("Local telegram-bot-api server process forked.")
    return child_proc
                   
def migrate_and_configure_bot_for_local_server(bot_token, bot_secret_token):
    try:
        log_bot_out_of_prod_telegram(bot_token)
        register_bot_on_local_bot_api_server(bot_token, bot_secret_token)
        configure_webhook_for_local_bot(bot_token, bot_secret_token)
    except Exception as e:
        print(e)

def log_bot_out_of_prod_telegram(bot_token):
    request_url = f'https://api.telegram.org/bot{bot_token}/logOut'
    response = requests.post(request_url)
    if not response.ok:
        not_ok_reason = json.loads(response.content.decode()).get("description")
        if not_ok_reason != "Logged out":
            raise Exception(str(response.text))
    
def register_bot_on_local_bot_api_server(bot_token, bot_secret_token):
    # Calling '/getMe' implicitly moves it to the local server
    local_telegram_bot_api_url = get_local_telegram_bot_api_url(bot_token)
    response = requests.get(f"{local_telegram_bot_api_url}/getMe", timeout = 5.0)
    if not response.ok:
        print(response.text)
        raise Exception(str(response.text))
    
def get_local_telegram_bot_api_url(bot_token):
    return f'{LOCAL_TELEGRAM_BOT_API_SERVER_ADDRESS}/bot{bot_token}'


def configure_webhook_for_local_bot(bot_token, bot_secret_token):

    local_telegram_bot_api_url = get_local_telegram_bot_api_url(bot_token)

    # Call deleteWebhook just to make sure any existing webhook configuration is gone
    # No harm in calling this one twice.
    response = requests.post(f'{local_telegram_bot_api_url}/deleteWebhook')
    if (not response.ok):
        print(response.text)
        raise Exception(response.text)


    # Set the webhook to point to local cloudflare worker
    data = {
        'url': LOCAL_CLOUDFLARE_WORKER_URL,
        'secret_token': bot_secret_token,
        'allowed_updates': ['message', 'inline_query', 'chosen_inline_result', 'callback_query'],
        'drop_pending_updates': True # DO NOT set this option when configuring prod webhook
    }
    headers = {
        "Content-Type": "application/json"
    }
    response = requests.post(f"{local_telegram_bot_api_url}/setWebhook", data=json.dumps(data), headers = headers)
    if (not response.ok):
        print(response.text)
        raise Exception(response.text)
    
    check_webhook_response = requests.get(f"{local_telegram_bot_api_url}/getWebhookInfo")
    if not check_webhook_response.ok:
        print(response.text)
        raise Exception(response.text)
    
if __name__ == "__main__":
    args = parse_args()

    poll_until_port_is_unoccupied(LOCAL_CLOUDFLARE_WORKER_PORT)
    poll_until_port_is_unoccupied(LOCAL_TELEGRAM_BOT_API_SERVER_PORT)

    do_it(args)