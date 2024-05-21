from argparse import ArgumentParser
import base58

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--key", type = str)
    return parser.parse_args()

def do_it(args):
    key : str = args.key.strip()
    if key.startswith("["):
        key = key[1:]
    if key.endswith("]"):
        key = key[:-1]
    key_int_array = [ int(token) for token in key.split(",") ]
    print(key_int_array)
    print(base58.b58encode(bytes(key_int_array)).decode('utf-8'))


if __name__ == "__main__":
    args = parse_args()
    do_it(args)