import requests
from argparse import ArgumentParser

from .bot_configure_info import configure_bot_info
from .wrangler_push_secrets import push_secrets

from .bot_configure_commands import configure_bot_commands
from .bot_configure_webhook import configure_webhook
from .wrangler_deploy_worker import wrangler_deploy
from ..wrangler_common import determine_workers_url, get_environment_variable, get_secret, do_wrangler_login, get_wrangler_toml_property, make_telegram_api_method_url, wrangler_whoami

def do_you_want_to(question : str) -> bool:
    response = input(question + " Y/N: ").lower().strip()
    if response == 'y':
        return True
    elif response == 'n':
        return False
    else:
        raise Exception(f"Didn't understand response: '{response}'")

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--env", required = True, type = str)
    return parser.parse_args()

def get_bot_token(env : str):
    bot_token = get_secret("SECRET__TELEGRAM_BOT_TOKEN", env)
    return bot_token

def maybe_delete_webhook(env : str):
    url = make_telegram_api_method_url('deleteWebhook')
    response = input("Do you want to delete the webhook?").lower().strip()
    if response == 'y':
        requests.post(url)
    else:
        print("Ok! Continuing onwards.")

def deploy(env : str):

    do_wrangler_login()
    ask_to_verify_login()

    if do_you_want_to("Deploy wrangler worker?"):
        wrangler_deploy(env, dry = False)

    if do_you_want_to("Push secrets?"):
        push_secrets(env)

    # Environment variables should get pushed with the wrangler.toml
    
    if do_you_want_to("Configure webhook?"):
        configure_webhook(env)

    if do_you_want_to("Configure bot commands?"):
        configure_bot_commands(env)

    if do_you_want_to("Configure bot name/description/shortdescription?"):
        configure_bot_info(env)


def ask_to_verify_login():
    wrangler_whoami()
    response = input("Inspect your current wrangler login.  Proceed? Y/N").lower().strip()
    if (response != 'y'):
        raise Exception(f"Did not proceed (Answered: '{response}')")    

if __name__ == "__main__":
    args = parse_args()
    env = args.env.strip()
    bot_token = args.bot_token.strip()
    deploy(env,bot_token)