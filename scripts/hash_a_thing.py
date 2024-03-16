from argparse import ArgumentParser
from hashlib import sha256

def parse_arguments():
    parser = ArgumentParser()
    parser.add_argument("--thing", type = str)
    return parser.parse_args()

def do_it(args):
    thing : str = args.thing.strip()
    print(sha256(thing.encode('utf-8')).hexdigest())

if __name__ == "__main__":
    args = parse_arguments()
    do_it(args)
