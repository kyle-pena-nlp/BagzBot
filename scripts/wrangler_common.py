import json, subprocess, requests
import tomli
from typing import Dict, Union
from urllib.parse import urljoin


LOGIN_COMMAND                         = "npx wrangler login"
LOGOUT_COMMAND                        = "npx wrangler logout"
WHOAMI_COMMAND                        = "npx wrangler whoami"
FETCH_KV_COMMAND                      = "npx wrangler kv:key --namespace-id={namespace_id} get {key}"
LIST_NAMESPACE_COMMAND                = "npx wrangler kv:namespace list"

def do_wrangler_login():
    subprocess.run(LOGIN_COMMAND,                    
                     check = True, 
                     shell = True)   
    
def do_wrangler_logout():
    subprocess.run(LOGOUT_COMMAND,
                   check = True,
                   shell = True)

def wrangler_whoami():
    subprocess.run(WHOAMI_COMMAND,
                   check = True,
                   shell = True)
    
def print_wrangler_environment_variables(env : str):
    parsed_toml = _parse_toml_file("./wrangler.toml")
    environment_variables = parsed_toml["env"][env]["vars"]
    max_key_length = max(map(len,environment_variables))
    print("")
    print(f"===ENVIRONMENT VARIABLES for '{env}'===")
    print("")

    for i, key in enumerate(sorted(environment_variables)):
        value = environment_variables[key]
        padding_length = (max_key_length+1)-(len(key))
        filler = '-'*(padding_length) if (i % 2 == 0) else '='*(padding_length)
        print(f"{key}{filler}: {value}")
    

def is_empty_or_none(string : Union[str,None]):
    return string is None or string.strip() == ''

def get_secrets(env : str) -> Dict[str,str]:
    with open(f".dev.vars.{env}", "rb") as f:
        return tomli.load(f)
    
def get_secret(key : str, env : str):
    toml_vars = get_secrets(env)
    secret = toml_vars.get(key)
    if is_empty_or_none(secret):
        raise Exception(f"'{env}': '{key}' not found")
    return secret


def determine_workers_url(env : str, test = True):
    account_id = get_environment_variable("CLOUDFLARE_ACCOUNT_ID", env)
    name = get_wrangler_toml_property(f"env.{env}.name", env)
    worker_url = f"https://{name}.{account_id}.workers.dev"
    if test:
        _test_workers_url(worker_url, env)
    return worker_url

def _test_workers_url(workers_url : str, env : str):
    webhook_secret_token = get_secret("SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN", env)
    headers = { 'X-Telegram-Bot-Api-Secret-Token': webhook_secret_token }
    response = requests.post(workers_url, headers = headers, json = { 'stuff': 'doesnt matter'})
    if not response.ok:
        raise Exception(f"Workers URL {workers_url} doesn't work")

def make_telegram_api_method_url(method : str, env : str):
    url = make_telegram_bot_url(env)
    return f"{url}/{method}"

def make_telegram_bot_url(env : str):
    bot_token = get_secret("SECRET__TELEGRAM_BOT_TOKEN", env)
    telegram_url = get_environment_variable("TELEGRAM_BOT_SERVER_URL", env)
    return f"{telegram_url}/bot{bot_token}"

def get_wrangler_toml_property(property_path : str, env : str):
    path_tokens = property_path.split(".")
    parsed_toml = _parse_toml_file("./wrangler.toml")
    obj = parsed_toml
    pathSoFar = ""
    for token in path_tokens:
        pathSoFar += token
        obj = obj.get(token)
        if obj is None:
            raise Exception("{pathSoFar} was None")
    return obj

def get_environment_variables(env : str):
    parsed_toml = _parse_toml_file("./wrangler.toml")
    return parsed_toml["env"][env]["vars"]

def get_worker_name(env : str):
    parsed_toml = _parse_toml_file("./wrangler.toml")
    return parsed_toml["name"]

def _parse_toml_file(filepath : str):
    with open(filepath, "rb") as f:
        return tomli.load(f)

def get_environment_variable(key : str, env : str):
    env_vars = get_environment_variables(env)
    value = env_vars.get(key)
    if is_empty_or_none(value):
        raise Exception(f"'{env}': '{key}' not found")
    return value

def get_KV_from_cloudflare(namespace_id, key):
    value = subprocess.run(FETCH_KV_COMMAND.format(key=key, namespace_id=namespace_id), 
                     check = True, 
                     shell = True,
                     capture_output = True,
                     text = True).stdout
    return value

def get_namespace_id(env):
    result = subprocess.run(LIST_NAMESPACE_COMMAND, 
                   check = True, 
                   shell = True,
                   capture_output = True,
                   text = True)
    if result.returncode != 0:
        raise Exception("Nonzero returncode for LIST_NAMESPACE_COMMAND")
    namespaces = json.loads(result.stdout)
    namespaces = { namespace["title"]:  namespace for namespace in namespaces }
    if env not in namespaces:
        raise Exception(f"No namespace called {env}")
    return namespaces[env]["id"]
    
