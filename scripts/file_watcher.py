import os, time
from argparse import ArgumentParser
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from dev.local_dev_common import *

class ChangeHandler(FileSystemEventHandler):
    def __init__(self):
        pass
    def on_modified(self, event):
        if event.is_directory:
            return
        print(f'File changed: {event.src_path}')
        file_parts = os.path.splitext(os.path.basename(event.src_path))
        if len(file_parts) != 2 or file_parts[1] != '.messages':
            return
        user_id = file_parts[0]
        cmd = f'python3 scripts/simulated_user.py --user_id={user_id}'
        execute_shell_command(cmd)

def parse_args():
    parser = ArgumentParser()
    args = parser.parse_args()
    return args


def do_it(args):
    path = sim_dir()
    event_handler = ChangeHandler()
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
    maybe_attach_debugger("file_watcher", FILE_WATCHER_DEBUG_PORT)
    do_it(args)

    
