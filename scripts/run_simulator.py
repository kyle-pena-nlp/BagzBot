import subprocess
from glob import glob
from argparse import ArgumentParser, Namespace
from dev.local_dev_common import * 
from dev.local_dev_common import *
from start_dev_box import *

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--num_users", type = int, required = False, default = 5000)
    parser.add_argument("--sim_seconds", type = int, required = True)
    parser.add_argument("--user_spinup_delay_seconds", type = int, required = False, default = 1)
    parser.add_argument("--user_funding_amt", type = float, required = True)
    parser.add_argument("--debuggers_to_attach", type = str, nargs="*", choices = ["self", "fake_telegram", "file_watcher", "simulated_user", "spin_up_users"], required = False, default = [])
    parser.add_argument("--attach_debugger", type = parse_bool, required = False, default = False)
    return parser.parse_args()

def do_it(args):

    child_procs = []

    try:
        
        ensure_simdir_exists()

        # create a miniature implementation of the telegram infra with 'fake users' interacting with it (all running locally)
        #start_fake_telegram_server(args, child_procs)

        # this process listens to changes to {user_id}.messages files and initiates a "reaction" by the simulated user
        start_user_messages_file_watcher(args, child_procs)

        # intercepts calls to api.telegram.org and redirects them to 'fake telegram'
        #start_mitm_proxy(args, child_procs)

        # starts the devbox environment behind the mitm proxy that redirects to 'fake telegram', per above
        #start_dev_box_behind_mitm_proxy(args, child_procs)

        # gradually spin up users
        #spin_up_users(args, child_procs)

        # wait here - don't proceed to (recursively) kill procs until a key has been pressed
        print("Press any key to end simulation.")
        wait_for_any_key()

    except Exception as e:
        print(str(e))
    finally:
        kill_procs(child_procs)
        remove_lingering_file_locks()

def remove_lingering_file_locks():
    lock_filepaths = glob(os.path.join(pathed(""), "*.lock"))
    for lock_filepath in lock_filepaths:
        if os.path.exists(lock_filepath):
            os.remove(lock_filepath)


def spin_up_users(args, child_procs):
    cmd = f"python3 scripts/spin_up_users.py --user_spinup_delay_seconds={args.user_spinup_delay_seconds}"
    if 'spin_up_users' in args.debuggers_to_attach:
        cmd = cmd + " --attach_debugger=True"
    process = execute_shell_command(cmd)
    child_procs.append(process)
    

def start_user_messages_file_watcher(args, child_procs):
    TELEGRAM_SECRET_TOKEN = get_secret("SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN", "dev")
    WRANGLER_URL = LOCAL_CLOUDFLARE_WORKER_URL
    SIMTEST_FUNDING_WALLET_PRIVATE_KEY = get_secret("SECRET__SIMTEST_FUNDING_WALLET_PRIVATE_KEY", "dev")
    USER_FUNDING_AMT = args.user_funding_amt
    cmd = f"python3 scripts/file_watcher.py --telegram_secret_token={TELEGRAM_SECRET_TOKEN} --wrangler_url={WRANGLER_URL} --funding_wallet_private_key={SIMTEST_FUNDING_WALLET_PRIVATE_KEY} --user_funding_amt={USER_FUNDING_AMT}"
    if 'file_watcher' in args.debuggers_to_attach:
        cmd = cmd + " --attach_debugger=True"
    if 'simulated_user' in args.debuggers_to_attach:
        cmd = cmd + ' --attach_simulated_user_debugger=True'
    process = execute_shell_command(cmd)
    child_procs.append(process)

def start_fake_telegram_server(args, child_procs):
    cmd = "python3 scripts/fake_telegram.py"
    if 'fake_telegram' in args.debuggers_to_attach:
        cmd = cmd + ' --attach_debugger=True'
    process = execute_shell_command(cmd)
    child_procs.append(process)

def start_mitm_proxy(args, child_procs):
    script_path = "scripts/redirect.py"
    command = f"mitmproxy -s {script_path}"
    process = execute_shell_command(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    child_procs.append(process)

def start_dev_box_behind_mitm_proxy(args, child_procs) -> subprocess.Popen: 
    # set up mitmproxy environment variable
    env = os.environ.copy()
    env['http_proxy']  = LOCAL_MITM_PROXY_SERVER_ADDRESS
    env['https_proxy'] = LOCAL_MITM_PROXY_SERVER_ADDRESS
    # Start the devbox
    cmd = "python3 scripts/start_dev_box.py --start_local_telegram_bot=False"
    process = execute_shell_command(cmd, env=env)
    child_procs.append(process)
    

def ensure_simdir_exists():
    os.makedirs(sim_dir(), exist_ok = True)

if __name__ == "__main__": 
    args = parse_args()
    if "self" in args.debuggers_to_attach or args.attach_debugger:
        attach_debugger(RUN_SIMULATOR_DEBUG_PORT)
    do_it(args) 
