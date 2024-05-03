import os, time, random
from glob import glob
from argparse import ArgumentParser
from dev.local_dev_common import *

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--user_spinup_delay_seconds", type=int, required=True)
    parser.add_argument("--attach_debugger", type = parse_bool, required = False, default = False)
    return parser.parse_args()

def user_id_of(fp):
    return int(os.path.splitext(os.path.basename(fp))[0])+1

def touch(fp):
    with open(fp, 'a'):
        os.utime(fp, times=None)  # Set to current time

def do_it(args):

    num_users = args.num_users
    messages_fps = glob(os.path.join(sim_dir(), "*.messages"))
    user_count = 0

    randn_noise = random.gauss(0,0.5)

    # For existing users, wake up an existing user by touching the file
    for messages_fp in messages_fps:
        touch(messages_fp)
        user_count += 1
        time.sleep(args.user_spinup_delay_seconds + randn_noise)

    # If we still don't have enough users, make some by writing out empty user messages files
    next_user_id = max([ user_id_of(fp) for fp in messages_fp ], default = 0) + 1
    if user_count < num_users:
        # Write out an empty file - the file watcher will pick that up and start initiating first user actions
        with open(pathed(f'{next_user_id}.messages', 'w+'))  as f:
            f.write("")
        next_user_id += 1
        time.sleep(args.user_spinup_delay_seconds + randn_noise)

if __name__ == "__main__":
    args = parse_args()
    if args.attach_debugger:
        attach_debugger(SPIN_UP_USERS_DEBUG_PORT)
    do_it(args)