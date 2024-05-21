import subprocess
from argparse import ArgumentParser, Namespace
import shlex

def strict_parse_bool(string : str) -> bool:
    if string == "True":
        return True
    elif string == "False":
        return False
    else:
        raise Exception("Not a bool: " + string)

def wrangler_deploy(env : str, dry : bool):
    command = f'npx wrangler deploy --env "{env}"'
    if dry:
        command += " --dry-run "
    subprocess.run(shlex.split(command), capture_output=False, text=True, shell=True)

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--env", type=str, required=True, description="Environment of worker")
    parser.add_argument("--name", type=str, required=True, description="Name of worker in cloudflare")
    parser.add_argument("--dry", type=str, required=False, default="True")
    return parser.parse_args()

if __name__ == "__main__":
    args : Namespace = parse_args()
    env : str = args.env.strip()
    name : str = args.name.strip()
    dry : bool = strict_parse_bool(args.dry.strip())
    wrangler_deploy(env,dry)