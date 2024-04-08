from argparse import ArgumentParser
import time
import requests

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--port", type = int, required = True)
    args = parser.parse_args()
    return args

def do_it(args):
    every_minute_url = f'http://localhost:{args.port}/__scheduled?cron=*+*+*+*+*'
    while True:
        try:
            print("_scheduled invocation")
            requests.post(every_minute_url)
        except Exception as e:
            print("_scheduled invocation failed: " + str(e))
        finally:
            time.sleep(60)


if __name__ == "__main__":
    args = parse_args()
    do_it(args)