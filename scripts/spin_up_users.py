import os, time, random, json
from glob import glob
from argparse import ArgumentParser
from dev.local_dev_common import *

def parse_args():
    parser = ArgumentParser()
    return parser.parse_args()

def user_id_of(fp):
    return int(os.path.splitext(os.path.basename(fp))[0])+1

def touch(fp):
    with open(fp, 'a'):
        os.utime(fp, times=None)  # Set to current time

def do_it(args):

    num_users = get_sim_setting("num_users")
    user_spinup_delay_seconds = get_sim_setting("user_spinup_delay_seconds")
    messages_fps = glob(os.path.join(sim_dir(), "*.messages"))
    user_count = 0

    # For existing users, wake up an existing user by touching the file
    for messages_fp in messages_fps:
        print(f"Waking up user with ID {user_id_of(messages_fp)}")
        touch(messages_fp)
        user_count += 1
        randn_noise = random.gauss(0,0.5)
        time.sleep(user_spinup_delay_seconds + randn_noise)

    # If we still don't have enough users, make some by writing out empty user messages files, then touching the files
    next_user_id = max([ user_id_of(messages_fp) for messages_fp in messages_fps ], default = 0) + 1
    while user_count < num_users:
        print(f"Creating new user with ID {next_user_id}")
        new_user_messages_filepath = pathed(f'{next_user_id}.messages')
        with open(new_user_messages_filepath, 'w+')  as f:
            json.dump([],f)
        touch(new_user_messages_filepath)
        next_user_id += 1
        user_count += 1
        randn_noise = random.gauss(0,0.5)
        time.sleep(user_spinup_delay_seconds + randn_noise)

if __name__ == "__main__":
    args = parse_args()
    maybe_attach_debugger("spin_up_user", SPIN_UP_USERS_DEBUG_PORT)
    do_it(args)