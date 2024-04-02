import subprocess, shlex, json
from argparse import ArgumentParser
from wrangler_common import get_secrets

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--env", required = True, type = str)
    return parser.parse_args()

def push_secrets(env : str):
    toml_vars = get_secrets(env)
    secrets = { key : value for (key,value) in toml_vars.items() if key.startswith("SECRET__") }
    
    print("Here are the secrets for inspection:")
    print("")
    print(json.dumps(secrets, indent = 1))
    print("")

    if (any([ key for key in secrets if not key.startswith("SECRET")])):
        raise Exception("CONFIG PROBLEM AND/OR DEV ERROR: At least one secret did not start with word SECRET")    
    
    for (key,value) in secrets.items():
        print(f"(in: '{env}') '{key}': '{value}'")
        response = input("Y/N: ").lower()
        if response != 'y':
            raise Exception(f"User stopped setting of secret in {env}")
        command = f"npx wrangler secret put {key} --env {env}"
        output, errors = _pipe_to_command(command, value)
        
        if output.strip():
            print("Output: " + output)
        
        if errors.strip():
            print("Errors: " + errors)

def _pipe_to_command(command, input_string):
    # Start the subprocess with stdin and stdout as PIPE
    # Ensure universal_newlines=True for text mode
    process = subprocess.Popen(shlex.split(command), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding='utf-8', text=True, shell=True)
    # Send the input_string to the subprocess and get the output
    output, errors = process.communicate(input=input_string)
    return output, errors

if __name__ == "__main__":
    args = parse_args()
    env = args.env.strip()
    push_secrets(env)