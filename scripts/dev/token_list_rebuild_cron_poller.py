from argparse import ArgumentParser
import time
import requests

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--port", type = int, required = True)
    parser.add_argument("--token_list_rebuild_frequency", type = int, required = False, default = 60*10)
    args = parser.parse_args()
    return args

def do_it(args):
    every_10_minutes_url = f'http://localhost:{args.port}/__scheduled?cron=*/10+*+*+*+*'
    while True:
        try:
            print("token refresh _scheduled invocation")
            requests.post(every_10_minutes_url)
        except Exception as e:
            print("token refresh _scheduled invocation failed: " + str(e))
        finally:
            time.sleep(args.token_list_rebuild_frequency)


if __name__ == "__main__":
    args = parse_args()
    do_it(args)