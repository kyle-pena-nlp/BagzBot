import os, json, random, time, requests, re, shutil
from argparse import ArgumentParser, Namespace
from typing import List, Union
from dev.transfer_funds import transfer_sol
from dev.local_dev_common import *

"""
    The purpose of this script is to handle file change events on
    any of the 'user messages' files.

    If the file changes, that means that a new message was pushed to the user or a message was edited or deleted.

    This script looks at the messages the user has and simulates a user "choice" in response.
"""

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--user_id", type = int, required = True)
    parser.add_argument("--wrangler_url", type = str, required = True)
    parser.add_argument("--telegram_secret_token", type = str, required = True)
    parser.add_argument("--funding_wallet_private_key", type = str, required = True)
    parser.add_argument("--user_funding_amt", type = float, required = True)
    parser.add_argument("--attach_debugger", type = parse_bool, required = False, default = False)
    args = parser.parse_args()
    return args

def load_user_metadata(user_id : int):
    user_metadata_filepath = pathed(f"{user_id}.metadata")
    if  not os.path.exists(user_metadata_filepath):
        user_metadata = dict(user_id = user_id, unfunded = True, look_back = 3)     
        with open(user_metadata_filepath, "w+") as f:
            json.dump(user_metadata, f)
    with open(user_metadata_filepath, "r+") as f:
        return json.load(f)

def load_user_messages(user_id : int):
    user_messages_filepath = pathed(f"{user_id}.messages")
    if not os.path.exists(user_messages_filepath):
        with open(user_messages_filepath, "w+") as f:
            json.dump([], f, indent = 1)
    with open(user_messages_filepath, "r+") as f:
        messages = json.load(f)
    return messages

def get_simulated_user_webhook_response(args, messages, user_metadata) -> Union[any,None]:

    # sleep a random amount of time 0-10 seconds
    time.sleep(random.random() * 10)

    # If there are no messages in history, initiate interactions with bot by sending the 'start' command
    if len(messages) == 0:
        return make_command_webhook_request('start', messages, user_metadata)

    # Scrape essential data out of messages history.  If essential data is missing, add nav_hint to get to page with it.
    try_init_metadata_from_messages(messages, user_metadata)

    # Always respond to a reply question
    reply_question = get_reply_question(messages)
    if reply_question:
        webhook_request_body = make_response_to_reply_question_webhook_request(reply_question)
        return webhook_request_body

    # Otherwise, If there are nav_hints to follow, try to follow them instead of doing anything else.
    if len(user_metadata.get("nav_hint") or []) > 0:
        navhint_followed, response = try_follow_next_nav_hint(messages, user_metadata)
        if navhint_followed is not None:
            nav_hints = user_metadata.get("nav_hint")
            user_metadata["nav_hint"] = nav_hints[nav_hints.index(navhint_followed)+1:]           
            return response

    # If the wallet has never been funded, try to fund it from the simulation funds wallet
    if user_metadata.get("unfunded"):
        user_metadata["unfunded"] = try_fund_user_wallet(args, user_metadata)

    # click a random button on a menu if any visible
    recent_menus = get_menus(messages)[-user_metadata.look_back:]
    if len(recent_menus) > 1:
        menu = random.choice(recent_menus)
        webhook_request_body = make_click_random_menu_code_button_webhook_request(menu, user_metadata)
        return webhook_request_body
    
    # or issues the start command
    return make_command_webhook_request("start", messages, user_metadata)

def try_fund_user_wallet(args, user_metadata):
    allowance = args.user_funding_amt
    funding_wallet_private_key = args.funding_wallet_private_key
    user_wallet = user_metadata.get("wallet_address")
    if user_wallet is not None:
        return try_transfer_funds_to_user(funding_wallet_private_key, user_wallet, allowance)
    return False

def try_transfer_funds_to_user(funding_wallet_private_key, user_wallet, allowance):
    try:
        transfer_sol(funding_wallet_private_key, user_wallet, allowance)
        return True
    except:
        return False

def make_command_webhook_request(command, messages, user_metadata):
    user_id = user_metadata.get("user_id")
    new_message_id = max([get_message_id(message) for message in messages], default = 0) + 1
    return {
        "update_id": 123456789,
        "message": {
            "message_id": new_message_id,
            "from": {
                "id": user_id,
                "is_bot": False,
                "first_name": "John",
                "last_name": "Doe",
                "username": "johndoe",
                "language_code": "en"
            },
            "chat": {
                "id": user_id,
                "first_name": "John",
                "last_name": "Doe",
                "username": "johndoe",
                "type": "private"
            },
            "date": int(time.time()),
            "text": f"/{command}",
            "entities": [
                {
                    "offset": 0,
                    "length": len(command) + 1,
                    "type": "bot_command"
                }
            ]
        }
    }

def try_follow_next_nav_hint(messages, user_metadata):
    recent_messages = messages[::-1][:3]
    for nav_hint in (user_metadata.get("nav_hint") or []):
        for recent_message in recent_messages:
            if has_menu_code(recent_message, nav_hint):
                return nav_hint, make_click_menu_code_button_webhook_request(recent_message, nav_hint)
    return None

def has_menu_code(message, menu_code):
    return menu_code in get_button_menu_codes(message)

def get_button_menu_codes(message):
    buttons = get_buttons(message)
    button_menu_codes = [ (button.get("callback_data") or "").split(":")[0] for button in buttons ]
    return button_menu_codes

def get_buttons(message):
    inline_keyboard = (message.get("reply_markup") or dict()).get("inline_keyboard") or [[]]
    buttons = [ button for line in inline_keyboard for button in line ]
    return buttons

def make_click_menu_code_button_webhook_request(menu_code, message, user_metadata):
    buttons = get_buttons(message)
    menu_codes = get_button_menu_codes(message)
    idx = menu_codes.index(menu_code)
    user_id = user_metadata.get("user_id")
    button = buttons[idx]
    {
        "update_id": 123456789, # not used in my code, doesn't matter
        "callback_query": {
            "id": "4382abcdef", # not used in my code, doesn't matter
            "from": {
                "id": user_id,
                "is_bot": False,
                "first_name": f"UserID",
                "last_name": f"{user_id}",
                "username": "UserID{user_id}",
                "language_code": "en"
            },
            "message": message,
            "chat_instance": user_id,
            "data": button.callback_data
        }
    }

def make_click_random_menu_code_button_webhook_request(message, user_metadata):
    random_menu_code = random.choice(get_button_menu_codes(message))
    return make_click_menu_code_button_webhook_request(random_menu_code, message, user_metadata)

def get_message_id(message):
    return (message.get("message") or dict()).get("message_id")

def get_menus(messages : List[any]) -> List[any]:
    return [ message for message in messages if is_menu(message) ]

def is_menu(message) -> bool:
    return len(parse_callback_buttons(message)) > 0

def try_init_metadata_from_messages(messages, user_metadata):
    
    if "wallet_address" not in user_metadata:
        wallet_address = try_get_wallet_address(messages)
        if wallet_address:
            user_metadata["wallet_address"] = wallet_address
        else:
            user_metadata["nav_hint"] = ["Main"] # MenuCode.Main
    
    if "private_key" not in user_metadata:
        private_key = try_get_private_key(messages)
        if private_key:
            user_metadata["private_key"] = private_key
        else:
            user_metadata["nav_hint"] = ["Wallet","View.PK"]

    if "balance" not in user_metadata:
        balance = try_get_balance(messages)
        if balance:
            user_metadata["balance"] = balance
        else:
            user_metadata["nav_hint"] = ["Main"]

def try_get_wallet_address(messages):
    for message in messages:
        lines = (message.get("text") or "").splitlines()
        for line in lines:
            # This will match the main menu.
            if ("Wallet" in line) and "<code>" in line and "</code>" in line:
                match : re.Match[str] = re.match(r"<code>(?<wallet>[^<]+)</code>")
                if match:
                    return match.group("wallet")
                
def try_get_private_key(messages):
    for message in messages:
        lines = (message.text("text") or "").splitlines()
        for line in lines:
            if '<span class="tg-spoiler">' in line:
                match : re.Match[str] = re.match(r'>(?<privatekey>[^<]+)</span>')
                if match:
                    return match.group("private_key")

def try_get_balance(messages):
    for message in messages:
        lines = (message.text("text") or "").spitlines()
        for line in lines:
            if 'Wallet SOL Balance' in line:
                match : re.Match[str]=  re.match("(?<amt>[0-9₀₁₂₃₄₅₆₇₈₉]+)")
                if match:
                    amt : str = match.group("amt")
                    amt = re.sub(r"(?<subs>0[₀₁₂₃₄₅₆₇₈₉]+)", lambda m: "0"*int(m.group("subs")[1:]))
                    return float(amt)


def write_user_metadata(user_id, user_metadata):
    with open(pathed(f"{user_id}.metadata"), "w+") as f:
        json.dump(user_metadata, f, indent = 1)


def get_reply_question(messages):
    return next(filter(is_reply_question_message, messages[::-1]),None)
    
def is_reply_question_message(message):
    return message.get("reply_markup") and message.get("reply_markup").get("force_reply")

def make_response_to_reply_question_webhook_request(reply_question, user_metadata, new_message_id):
    type = get_reply_question_type(reply_question)
    if type == 'buy_quantity':
        return make_reply_question_response("0.001", reply_question, user_metadata, new_message_id)
    elif type == 'slippage_pct':
        return make_reply_question_response(2 * random.random() + 0.5, reply_question, user_metadata, new_message_id)
    elif type == 'trigger_pct':
        return make_reply_question_response(5 * random.random() + 5, reply_question, user_metadata, new_message_id)
    elif type == 'token':
        return make_reply_question_response(random_token(), reply_question, user_metadata, new_message_id)
    else:
        return make_reply_question_response("", reply_question, user_metadata, new_message_id)

def random_token():
    # TODO: pull from large list of tokens
    return random.choice(["WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk"])

def get_reply_question_type(reply_question):
    text = reply_question.get("message").get("text").lower()
    if "address" in text:
        return "token"
    elif "trigger" in text:
        return 'trigger_pct'
    elif "slippage" in text:
        return 'slippage_pct'
    elif "quantity" in text:
        return "buy_quantity"
    else:
        return "?"
    
def make_reply_question_response(response, reply_question, user_metadata, new_message_id):
    response = str(response)
    user_id = user_metadata["user_id"]
    {
        "update_id": 123456789,
        "message": {
            "message_id": new_message_id,
            "from": {
                "id": user_id,
                "is_bot": False,
                "first_name": "John",
                "last_name": "Doe",
                "username": "johndoe",
                "language_code": "en"
            },
            "chat": {
                "id": user_id,
                "first_name": "John",
                "last_name": "Doe",
                "username": "johndoe",
                "type": "private"
            },
            "date": int(time.time()),
            "reply_to_message": reply_question,
            "text": response
        }
    }


def user_types_in_random_token(message_data, user_metadata):
    token_addresses = [ "Wen" ]
    token_address = random.choice(token_addresses)
    return make_webhook_send_text_request_body(user_metadata.get("user_id"), user_metadata.chat_id, token_address)




def make_webhook_send_text_request_body(message_data, text):
    # Extracting chat ID
    chat_id = message_data['chat_id']
    # Extracting user information, assuming it is included in the message_data
    user = message_data.get('from')
    
    if user is None:
        raise ValueError("User data must be included in the message data.")

    return {
        "update_id": 1234567890,
        "message": {
            "message_id": message_data.get('message_id', 1),  # Default or extracted message_id
            "from": {
                "id": user['id'],
                "is_bot": user.get('is_bot', False),
                "first_name": user.get('first_name', 'Unknown'),
                "last_name": user.get('last_name', 'User'),
                "username": user.get('username', ''),
                "language_code": user.get('language_code', 'en')
            },
            "chat": {
                "id": chat_id,
                "first_name": user.get('first_name', 'Unknown'),
                "last_name": user.get('last_name', 'User'),
                "username": user.get('username', ''),
                "type": "private"  # Assuming a private chat, adjust accordingly
            },
            "date": int(time.time()),
            "text": text
        }
    }

def parse_callback_buttons(request_data):
    buttons = []
    # Check if 'reply_markup' and 'inline_keyboard' are in the request data
    if 'reply_markup' in request_data and 'inline_keyboard' in request_data['reply_markup']:
        for row in request_data['reply_markup']['inline_keyboard']:
            for button in row:
                # Check if the button contains 'callback_data'
                if 'callback_data' in button:
                    buttons.append(button['text'])
    return buttons

def send_to_wrangler(user_response, args):
    requests.post(args.wrangler_url, json = user_response, headers = {
        'X-Telegram-Bot-Api-Secret-Token': args.telegram_secret_token
    })


def wait_for_no_file_locks(user_id):
    start = time.time()
    messages_lock_filepath = pathed(f"{user_id}.messages.lock")
    metadata_lock_filepath = pathed(f"{user_id}.metadata.lock")
    while True:
        if not os.path.exists(messages_lock_filepath) and not os.path.exists(metadata_lock_filepath):
            break
        time.sleep(0.1)
        if time.time() - start > 10:
            break

def acquire_file_locks(user_id):
    wait_for_no_file_locks(user_id)
    messages_lock_filepath = pathed(f"{user_id}.messages.lock")
    with open(messages_lock_filepath, "w+") as f:
        f.write(f"{int(time.time())}")
    metadata_lock_filepath = pathed(f"{user_id}.metadata.lock")
    with open(metadata_lock_filepath, "w+") as f:
        f.write(f"{int(time.time())}")

def release_file_locks(user_id):
    messages_lock_filepath = pathed(f"{user_id}.messages.lock")
    metadata_lock_filepath = pathed(f"{user_id}.metadata.lock") 
    if os.path.exists(messages_lock_filepath):
        os.remove(messages_lock_filepath)
    if os.path.exists(metadata_lock_filepath):
        os.remove(metadata_lock_filepath)

def do_it(args : Namespace):
    user_id = args.user_id
    acquire_file_locks(user_id)
    try:
        messages = load_user_messages(user_id)
        user_metadata = load_user_metadata(user_id)
        orig_user_metadata = deep_clone(user_metadata)
        user_response = get_simulated_user_webhook_response(args, messages, user_metadata)
        if not deep_equals(orig_user_metadata, user_metadata):
            write_user_metadata(user_metadata)
        send_to_wrangler(user_response, args)
    finally:
        release_file_locks(user_id)

def deep_clone(x):
    return json.loads(json.dumps(x))

def deep_equals(x, y):
    return json.dumps(x, sort_keys=True) == json.dumps(y, sort_keys=True)

if __name__ == "__main__":
    args = parse_args()
    if args.attach_debugger and args.user_id == 1:
        attach_debugger(SIMULATED_USER_DEBUG_PORT)
    do_it(args)