from glob import glob
from dev.local_dev_common import * 
from dev.local_dev_common import *
from wrangler_common import _parse_toml_file, get_secret

def get_sim_setting(name):
    parsed_toml = _parse_toml_file("./scripts/.sim.settings.toml")
    return parsed_toml[name]

def remove_lingering_file_locks():
    lock_filepaths = glob(os.path.join(pathed(""), "*.lock"))
    for lock_filepath in lock_filepaths:
        if os.path.exists(lock_filepath):
            os.remove(lock_filepath)

def spin_up_simulation_users():
    cmd = f"python3 scripts/spin_up_users.py --user_spinup_delay_seconds={get_sim_setting("user_spinup_delay_seconds")}"
    if 'spin_up_users' in get_sim_setting("debuggers_to_attach"):
        cmd = cmd + " --attach_debugger=True"
    process = execute_shell_command(cmd)
    return process
    

def start_user_messages_file_watcher():
    TELEGRAM_SECRET_TOKEN = get_secret("SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN", "dev")
    WRANGLER_URL = LOCAL_CLOUDFLARE_WORKER_URL
    SIMTEST_FUNDING_WALLET_PRIVATE_KEY = get_secret("SECRET__SIMTEST_FUNDING_WALLET_PRIVATE_KEY", "dev")
    USER_FUNDING_AMT = get_sim_setting("user_funding_amount")
    cmd = f"python3 scripts/file_watcher.py --telegram_secret_token={TELEGRAM_SECRET_TOKEN} --wrangler_url={WRANGLER_URL} --funding_wallet_private_key={SIMTEST_FUNDING_WALLET_PRIVATE_KEY} --user_funding_amt={USER_FUNDING_AMT}"
    if 'file_watcher' in get_sim_setting("debuggers_to_attach"):
        cmd = cmd + " --attach_debugger=True"
    if 'simulated_user' in get_sim_setting("debuggers_to_attach"):
        cmd = cmd + ' --attach_simulated_user_debugger=True'
    process = execute_shell_command(cmd)
    return process

def start_fake_telegram_server():
    cmd = "python3 scripts/fake_telegram.py"
    if 'fake_telegram' in get_sim_setting("debuggers_to_attach"):
        cmd = cmd + ' --attach_debugger=True'
    process = execute_shell_command(cmd)
    poll_until_port_is_occupied(FAKE_TELEGRAM_SERVER_PORT)
    return process

def ensure_simdir_exists():
    os.makedirs(sim_dir(), exist_ok = True)
