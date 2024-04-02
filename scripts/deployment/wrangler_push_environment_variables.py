import json, subprocess, shlex
from argparse import ArgumentParser
from ..wrangler_common import get_secrets

def wrangler_push_environment_variables(env):
    toml_vars = get_secrets(env)
    env_vars = { key : value for (key,value) in toml_vars.items() if not key.startsWith("SECRET__") }
    
    print("Here are the env vars for inspection:")
    print("")
    print(json.dumps(env_vars, indent = 1))
    print("")

    if (any([ key for key in env_vars if key.startswith("SECRET")])):
        raise Exception("CONFIG PROBLEM AND/OR DEV ERROR: At least one env var started with word: SECRET")
    
    for (key,value) in env_vars.items():
        pass

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--env", required = True, type = str)
    return parser.parse_args()

if __name__ == "__main__":
    pass