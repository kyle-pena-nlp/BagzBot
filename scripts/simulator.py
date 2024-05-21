from glob import glob
from dev.local_dev_common import * 
from dev.local_dev_common import *
from simulated_user_viewer import SIMULATED_USER_VIEWER_PORT
from wrangler_common import get_secret

def remove_lingering_file_locks():
    lock_filepaths = glob(os.path.join(pathed(""), "*.lock"))
    for lock_filepath in lock_filepaths:
        if os.path.exists(lock_filepath):
            os.remove(lock_filepath)

def spin_up_simulation_users():
    cmd = f"python3 scripts/spin_up_users.py"
    process = execute_shell_command(cmd)
    return process

def start_user_messages_file_watcher():
    cmd = f"python3 scripts/file_watcher.py"
    process = execute_shell_command(cmd)
    return process

def start_fake_telegram_server():
    cmd = "python3 scripts/fake_telegram.py"
    process = execute_shell_command(cmd)
    poll_until_port_is_occupied(FAKE_TELEGRAM_SERVER_PORT)
    return process

def start_simulated_user_viewer():
    cmd = "python3 scripts/simulated_user_viewer.py"
    process = execute_shell_command(cmd)
    poll_until_port_is_occupied(SIMULATED_USER_VIEWER_PORT)
    return process

def ensure_simdir_exists():
    os.makedirs(sim_dir(), exist_ok = True)
