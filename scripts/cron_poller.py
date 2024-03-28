from argparse import ArgumentParser
import time
import requests

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--port", type = int, required = True)
    args = parser.parse_args()
    return args

def do_it(args):
    url = f'http://localhost:{args.port}/__scheduled?cron=*+*+*+*+*"'
    while True:
        print("_scheduled invocation")
        requests.post(url)
        time.sleep(60)


if __name__ == "__main__":
    args = parse_args()
    do_it(args)