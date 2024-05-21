from argparse import ArgumentParser
import json, os, shutil
import requests
from simulator import *
from wrangler_common import *
from commands import COMMANDS
from dev.local_dev_common import *

def run_cloudflare_worker(args):
    ENV = "sim" if args.sim else "dev"
    env_vars : Dict[str,str] = convert_env_vars_to_dict(args.env_vars)   
    if args.sim:
        env_vars["TELEGRAM_BOT_SERVER_URL"] = f"http://localhost:{FAKE_TELEGRAM_SERVER_PORT}"
    elif 'TELEGRAM_BOT_SERVER_URL' not in env_vars:
        env_vars['TELEGRAM_BOT_SERVER_URL'] = LOCAL_TELEGRAM_BOT_API_SERVER_ADDRESS 
    ENV_VARS = " ".join([ f'{var}:"{value}"' for (var,value) in env_vars.items() ])
    command = f'npx wrangler dev --env {ENV} --port {LOCAL_CLOUDFLARE_WORKER_PORT} --test-scheduled --ip 127.0.0.1 --var {ENV_VARS}'
    child_proc = execute_shell_command(command)
    poll_until_port_is_occupied(LOCAL_CLOUDFLARE_WORKER_PORT)
    return child_proc

def convert_env_vars_to_dict(env_vars):
    env_vars_dict = dict()
    for env_var in env_vars:
        if "=" not in env_var:
            raise Exception("env_var must be in format KEY=VALUE, was: {env_var}")
        tokens = env_var.split("=")
        env_vars_dict[tokens[0]] = tokens[1]
    return env_vars_dict

def start_CRON_poller():
    command = START_CRON_POLLER_COMMAND
    child_proc = execute_shell_command(command)
    return child_proc

def start_token_list_rebuild_CRON_poller(token_list_rebuild_frequency : int):
    command = START_TOKEN_LIST_REBUILD_CRON_POLLER_COMMAND.format(token_list_rebuild_frequency = token_list_rebuild_frequency)
    child_proc = execute_shell_command(command)
    return child_proc

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--token_list_rebuild_frequency", required = False, default = 60*30)
    parser.add_argument("--start_local_telegram_bot", type = parse_bool, required = False, default = True)
    parser.add_argument("--env_vars", nargs="*", type = str, default=[])
    parser.add_argument("--sim", action="store_true")
    args = parser.parse_args()
    return args

def do_it(args):

    child_procs = []

    try:

        if args.sim:
            ensure_simdir_exists()
            child_procs.append(start_fake_telegram_server())
            child_procs.append(start_user_messages_file_watcher())
            child_procs.append(start_simulated_user_viewer())

        print("Starting local cloudflare worker")
        child_procs.append(run_cloudflare_worker(args))

        if not args.sim:

            print("Starting local telegram-bot-api server")
            api_id   = get_secret("SECRET__TELEGRAM_API_ID", "dev")
            api_hash = get_secret("SECRET__TELEGRAM_API_HASH", "dev")
            child_procs.append(fork_shell_telegram_bot_api_local_server(api_id = api_id, api_hash = api_hash))
            child_procs.append(start_simulated_user_viewer())

            print("Setting up bot locally")
            bot_token = get_secret("SECRET__TELEGRAM_BOT_TOKEN", "dev")
            bot_secret_token = get_secret("SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN", "dev")

            migrate_and_configure_bot_for_local_server(bot_token, bot_secret_token)

        child_procs.append(start_CRON_poller())

        child_procs.append(start_token_list_rebuild_CRON_poller(args.token_list_rebuild_frequency))

        if args.sim:
            child_procs.append(spin_up_simulation_users())

        print("You may wish to start the wrangler debugger now.")
        print("Cloudflare worker and local bot api server ARE RUNNING!")
        print("Press any key to shut them down.")
        wait_for_any_key()
        print("You found the 'any key'!  Bye!")

    except Exception as e:
        print(e)
    finally:
        kill_procs(child_procs)
        remove_lingering_file_locks()

def fork_shell_telegram_bot_api_local_server(api_id, api_hash):
    shutil.rmtree(TELEGRAM_LOCAL_SERVER_WORKING_DIR, ignore_errors=True)
    os.makedirs(TELEGRAM_LOCAL_SERVER_WORKING_DIR, exist_ok=False)
    command = START_TELEGRAM_LOCAL_SERVER_COMMAND.format(api_id = api_id, api_hash = api_hash, working_dir=TELEGRAM_LOCAL_SERVER_WORKING_DIR)
    print(command)
    child_proc = execute_shell_command(command) # no shlex split here on purpose.  makes it parse the --local param weirdly.
    poll_until_port_is_occupied(LOCAL_TELEGRAM_BOT_API_SERVER_PORT)
    print("Local telegram-bot-api server process forked.")
    return child_proc
                   
def migrate_and_configure_bot_for_local_server(bot_token, bot_secret_token):
    try:
        log_bot_out_of_prod_telegram(bot_token)
        register_bot_on_local_bot_api_server(bot_token, bot_secret_token)
        configure_bot_commands(bot_token, bot_secret_token)
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

def configure_bot_commands(bot_token, bot_secret_token):

    local_telegram_bot_api_url = get_local_telegram_bot_api_url(bot_token)

    data = {
        'commands': COMMANDS,
        'scope': {
            'type': 'all_private_chats'
        }
    }
    headers = {
        "Content-Type": "application/json"
    }

    response = requests.post(f'{local_telegram_bot_api_url}/setMyCommands', data=json.dumps(data), headers = headers)
    if (not response.ok):
        print(response.text)
        raise Exception(response.text)

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

    if args.start_local_telegram_bot:
        poll_until_port_is_unoccupied(LOCAL_TELEGRAM_BOT_API_SERVER_PORT)
    
    do_it(args)