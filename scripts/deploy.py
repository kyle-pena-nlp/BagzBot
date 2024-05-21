import requests
from argparse import ArgumentParser

from deployment.bot_configure_info import configure_bot_info
from deployment.wrangler_push_secrets import push_secrets
from deployment.bot_configure_commands import configure_bot_commands
from deployment.bot_configure_webhook import configure_webhook
from deployment.wrangler_deploy_worker import wrangler_deploy
from deployment.bot_migrate_to_telegram_servers import migrate_telegram_bot_telegram_servers
from wrangler_common import get_secret, do_wrangler_login, make_telegram_api_method_url, print_wrangler_environment_variables, wrangler_whoami

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
    url = make_telegram_api_method_url('deleteWebhook', env)
    response = input("Do you want to delete the webhook?").lower().strip()
    if response == 'y':
        requests.post(url)
    else:
        print("Ok! Continuing onwards.")

def deploy(env : str):

    if do_you_want_to("Wrangler login?"):
        do_wrangler_login()

    ask_to_verify_login()

    ask_to_verify_settings(env)

    if do_you_want_to("Deploy wrangler worker?"):
        wrangler_deploy(env, dry = False)

    if do_you_want_to("Push secrets?"):
        push_secrets(env)

    if do_you_want_to("Migrate bot to telegram servers?"):
        migrate_telegram_bot_telegram_servers(env)

    # Environment variables should get pushed with the wrangler.toml
    
    if do_you_want_to("Configure webhook?"):
        configure_webhook(env)

    if do_you_want_to("Configure bot commands?"):
        configure_bot_commands(env)

    if do_you_want_to("Configure bot name/description/shortdescription?"):
        configure_bot_info(env)


def ask_to_verify_login():
    wrangler_whoami()
    response = input("Here's your wrangler login.  Does it look correct? Y/N: ").lower().strip()
    if (response != 'y'):
        raise Exception(f"Did not proceed (Answered: '{response}')") 

def ask_to_verify_settings(env : str):
    print_wrangler_environment_variables(env)
    response = input(f"Please inspect the settings for {env}. Do they look correct? Y/N: ").lower().strip()
    if (response != 'y'):
        raise Exception(f"Did not proceed (Answered: '{response}')")

if __name__ == "__main__":
    args = parse_args()
    env = args.env.strip()
    deploy(env)