from argparse import Namespace
import subprocess
import os, json
import requests, requests_toolbelt
import socket, time


def parse_args():
    webhook_secret_token = input("Enter telegram secret token:").strip()
    return Namespace(webhook_secret_token = webhook_secret_token)

def do_it(args):
    print(os.getcwd())

    # login and spin up the dev server
    #auth_command = f'npx wrangler login'
    #wrangler_command = f'npx wrangler dev --remote --env dev'
    #subprocess.run(auth_command,     shell = True, check = True)
    #subprocess.Popen(wrangler_command, shell = True)
    poll_until_port_is_occupied(8787)
    send_fetch_test(args)

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def poll_until_port_is_occupied(port, interval=0.5):
    while True:
        if is_port_in_use(port):
            print(f"Port {port} is now in use.")
            break
        else:
            print(f"Port {port} is not in use. Checking again in {interval} seconds.")
            time.sleep(interval)

def send_fetch_test(args):
    test_chat_id = -1002048294555
    data = {
        "update_id": 10000,
        "message": {
            "date": 1441645532,
            "chat": {
                "last_name": "Test Lastname",
                "type": "private",
                "id": test_chat_id,
                "first_name": "Test Firstname",
                "username": "Testusername"
            },
            "message_id": 1365,
            "from": {
                "last_name": "Test Lastname",
                "id": test_chat_id,
                "first_name": "Test Firstname",
                "username": "Testusername"
            },
            "text": "/start"
        }
    }

    # Setting the headers
    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Telegram-Bot-Api-Secret-Token": args.webhook_secret_token
    }

    webhook_url = "http://127.0.0.1:8787"

    # Making a POST request
    response = requests.post(webhook_url, 
                             headers=headers, 
                             data=json.dumps(data), 
                             verify=True)


if __name__ == "__main__":
    args = parse_args()
    do_it(args)