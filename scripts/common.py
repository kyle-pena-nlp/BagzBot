import psutil # pip install psutil
import os, sys, socket, time, subprocess
from typing import List

# Ports
# port that the cloudflare worker runs on.
# b/c it is the webhook, CF must run on 443, 88, 80, or 8443
LOCAL_CLOUDFLARE_WORKER_PORT = 8443
# telegram bot api is running on port 80 because fetch API in cloudflare ignores any other port
LOCAL_TELEGRAM_BOT_API_SERVER_PORT = 80 

# URLs
LOCAL_CLOUDFLARE_WORKER_URL = f"http://127.0.0.1:{LOCAL_CLOUDFLARE_WORKER_PORT}"
LOCAL_TELEGRAM_BOT_API_SERVER_ADDRESS = f"http://127.0.0.1:{LOCAL_TELEGRAM_BOT_API_SERVER_PORT}"

# Commands
START_CLOUDFLARE_LOCAL_WORKER_COMMAND = f'npx wrangler dev --env=dev --port={LOCAL_CLOUDFLARE_WORKER_PORT} --test-scheduled' # --log-level=debug
START_TELEGRAM_LOCAL_SERVER_COMMAND   = f'telegram-bot-api --api-id={{api_id}} --api-hash={{api_hash}} --dir={{working_dir}} --local --log=log.log --http-port={LOCAL_TELEGRAM_BOT_API_SERVER_PORT}' # --verbosity=4
TELEGRAM_LOCAL_SERVER_WORKING_DIR = f"telegram_bot_api_working_dir" + os.sep
START_CRON_POLLER_COMMAND = f'python scripts/cron_poller.py --port={LOCAL_CLOUDFLARE_WORKER_PORT}'

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
    msvcrt.getch()

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