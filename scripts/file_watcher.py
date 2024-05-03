import os, time
from argparse import ArgumentParser
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from dev.local_dev_common import *

class ChangeHandler(FileSystemEventHandler):
    def __init__(self, telegram_secret_token, wrangler_url, funding_wallet_private_key, user_funding_amt, attach_simulated_user_debugger):
        self.telegram_secret_token = telegram_secret_token
        self.wrangler_url = wrangler_url
        self.funding_wallet_private_key = funding_wallet_private_key
        self.user_funding_amt = user_funding_amt
        self.attach_simulated_user_debugger = attach_simulated_user_debugger
    def on_modified(self, event):
        if event.is_directory:
            return
        print(f'File changed: {event.src_path}')
        file_parts = os.path.splitext(os.path.basename(event.src_path))
        if len(file_parts) != 2 or file_parts[1] != '.messages':
            return
        user_id = file_parts[0]
        cmd = f'python3 scripts/simulated_user.py --user_id={user_id} --telegram_secret_token={self.telegram_secret_token} --wrangler_url={self.wrangler_url} --funding_wallet_private_key={self.funding_wallet_private_key} --user_funding_amt={self.user_funding_amt}'
        if self.attach_simulated_user_debugger:
            cmd = cmd + ' --attach_debugger=True'
        execute_shell_command(cmd)

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--telegram_secret_token", type = str, required = True)
    parser.add_argument("--wrangler_url", type = str, required = True)
    parser.add_argument("--funding_wallet_private_key", type=str, required=True)
    parser.add_argument("--user_funding_amt", type=float, required=True)
    parser.add_argument("--attach_debugger", type = parse_bool, required = False, default = False)
    parser.add_argument("--attach_simulated_user_debugger", type = parse_bool, required = False, default = False)
    args = parser.parse_args()
    return args


def do_it(args):
    path = sim_dir()
    event_handler = ChangeHandler(args.telegram_secret_token, 
        args.wrangler_url, 
        args.funding_wallet_private_key, 
        args.user_funding_amt,
        args.attach_simulated_user_debugger)
    observer = Observer()
    observer.schedule(event_handler, path, recursive=True)
    observer.start()
    try:
        while True:
            time.sleep(0.001)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    args = parse_args()
    if args.attach_debugger:
        attach_debugger(FILE_WATCHER_DEBUG_PORT)
    do_it(args)

    
