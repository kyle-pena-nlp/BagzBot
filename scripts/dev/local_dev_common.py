import psutil # pip install psutil
import os, sys, socket, time, subprocess, platform
from typing import List, Union
from argparse import ArgumentTypeError
import debugpy
import tomli

# Ports
# port that the cloudflare worker runs on.
# b/c it is the webhook, CF must run on 443, 88, 80, or 8443
LOCAL_CLOUDFLARE_WORKER_PORT = 8443
# telegram bot api is running on port 80 because fetch API in cloudflare ignores any other port
LOCAL_TELEGRAM_BOT_API_SERVER_PORT = 80 

MITM_PROXY_SERVER_PORT = 8080
FAKE_TELEGRAM_SERVER_PORT = 8081

# URLs
LOCAL_CLOUDFLARE_WORKER_URL = f"http://127.0.0.1:{LOCAL_CLOUDFLARE_WORKER_PORT}"
LOCAL_TELEGRAM_BOT_API_SERVER_ADDRESS = f"http://127.0.0.1:{LOCAL_TELEGRAM_BOT_API_SERVER_PORT}"
LOCAL_MITM_PROXY_SERVER_ADDRESS = f"http://127.0.0.1:{MITM_PROXY_SERVER_PORT}"
LOCAL_FAKE_TELEGRAM_SERVER_ADDRESS = f"http://127.0.0.1:{FAKE_TELEGRAM_SERVER_PORT}"

# Commands
# --ip is to keep wrangler happy for windows for versions 3.18ish
START_CLOUDFLARE_LOCAL_WORKER_COMMAND = f'npx wrangler dev --env=dev --port={LOCAL_CLOUDFLARE_WORKER_PORT} --test-scheduled --ip 127.0.0.1'
START_TELEGRAM_LOCAL_SERVER_COMMAND   = f'telegram-bot-api --api-id={{api_id}} --api-hash={{api_hash}} --dir={{working_dir}} --local --log=log.log --http-port={LOCAL_TELEGRAM_BOT_API_SERVER_PORT}' # --verbosity=4
TELEGRAM_LOCAL_SERVER_WORKING_DIR = f"telegram_bot_api_working_dir" + os.sep
START_CRON_POLLER_COMMAND = f'python3 scripts/dev/cron_poller.py --port={LOCAL_CLOUDFLARE_WORKER_PORT}'
START_TOKEN_LIST_REBUILD_CRON_POLLER_COMMAND = f'python3 scripts/dev/token_list_rebuild_cron_poller.py --port={LOCAL_CLOUDFLARE_WORKER_PORT} --token_list_rebuild_frequency={{token_list_rebuild_frequency}}'

def parse_bool(x : Union[str,bool]):
    x = str(x).lower().strip()
    if x == 'yes' or x == 'true' or x == 't':
        return True
    elif x == 'no' or x == 'false' or x == 'f':
        return False
    else:
        raise ArgumentTypeError(x)

def _wait_for_keypress_unix():
    import tty
    import termios
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(sys.stdin.fileno())
        sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)

def _wait_for_keypress_windows():
    import msvcrt
    msvcrt.getch() # type: ignore

def wait_for_any_key():
    # Technical Reference: https://www.youtube.com/watch?v=st6-DgWeuos
    if os.name == 'nt':  # Windows
        _wait_for_keypress_windows()
    else:  # Unix-based systems
        _wait_for_keypress_unix()

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def poll_until_port_is_unoccupied(port, interval = 0.5):
    while True:
        if not is_port_in_use(port):
            print(f"Port {port} is now NOT in use.")
            break
        else:
            print(f"Port {port} is still IN USE. Checking again in {interval} seconds.")
            time.sleep(interval)

def poll_until_port_is_occupied(port, interval=0.5):
    while True:
        if is_port_in_use(port):
            print(f"Port {port} is now in use.")
            break
        else:
            print(f"Port {port} is not in use. Checking again in {interval} seconds.")
            time.sleep(interval)

def kill_procs(child_procs : List[subprocess.Popen]):
    
    print("Attempting cleanup.")

    # Kill child processes
    for child_proc in child_procs:
        try:
            print(f"Killing child process: {child_proc.pid}")
            deep_proc_kill(child_proc)
            print("---Child process killed.")
        except Exception as e:
            print("Error killing child process: " + str(e))


def deep_proc_kill(proc):

    process = psutil.Process(proc.pid)
    for child in process.children(recursive=True):  # Iterate over child processes
        child.terminate()
    process.terminate()

    for child in process.children(recursive=True):
        child.wait()
    process.wait()

def execute_shell_command(command : str, **kwargs):
    command = maybe_source_profile(command)
    args =  dict(shell = True, cwd = os.getcwd(), bufsize=0)
    if platform.system().strip() in ['Darwin','Linux']:
        args["executable"] = "/bin/bash"
    args = { **args, **kwargs }
    return subprocess.Popen(command, **args)

def maybe_source_profile(command : str) -> str:
    if platform.system().strip() in ['Darwin','Linux']:
        cmd = "source ~/.bashrc && " + command
    else:
        cmd = command
    print(cmd)
    return cmd

FAKE_TELEGRAM_DEBUG_PORT = 5678
FILE_WATCHER_DEBUG_PORT = 5679
SPIN_UP_USERS_DEBUG_PORT = 5680
SIMULATED_USER_DEBUG_PORT = 5681
RUN_SIMULATOR_DEBUG_PORT = 5682

def pathed(filename : str):
    return os.path.join("./.simulator", filename)

def sim_dir():
    return pathed("")

def get_sim_setting(name):
    with open("./scripts/.sim.settings.toml", "rb") as f:
        parsed_toml = tomli.load(f)
        return parsed_toml[name]

def maybe_attach_debugger(name, debug_port):
    if name in get_sim_setting("debuggers_to_attach"):
        wait = name in get_sim_setting("waiting_debuggers")
        attach_debugger(debug_port, wait = wait)

def attach_debugger(debug_port, wait = True):
    debugpy.listen(('0.0.0.0', debug_port))
    if wait:
        print(f"Waiting to attach debugger on port {debug_port}")
        debugpy.wait_for_client()