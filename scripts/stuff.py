from argparse import ArgumentParser

from wrangler_common import determine_workers_url

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--env", type = str, required = True)
    args = parser.parse_args()
    return args

def do_it(args):
    env = args.env.strip()
    print(determine_workers_url(env, test = False))

if __name__ == "__main__":
    args = parse_args()
    do_it(args)