import os, json, random, time, requests, re, shutil
from argparse import ArgumentParser, Namespace
from typing import List, Union, Any
from dev.transfer_funds import transfer_sol
from dev.local_dev_common import *
from wrangler_common import get_secret

"""
    The purpose of this script is to handle file change events on
    any of the 'user messages' files.

    If the file changes, that means that a new message was pushed to the user or a message was edited or deleted.

    This script looks at the messages the user has and simulates a user "choice" in response.

    There is some intelligent steering of which 'choice' the 'user' makes depending on what info is available

    This is done via the property 'nav_hint_paths' in user_metadata.
"""

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--user_id", type = int, required = True)
    args = parser.parse_args()

    # Rather than restructure a lot of code...
    args.wrangler_url = LOCAL_CLOUDFLARE_WORKER_URL
    args.telegram_secret_token = get_secret("SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN", "sim")
    args.funding_wallet_private_key = get_secret("SECRET__SIMTEST_FUNDING_WALLET_PRIVATE_KEY", "sim")
    args.user_funding_amt = get_sim_setting("user_funding_amount")

    return args

def load_user_metadata(user_id : int):
    user_metadata_filepath = pathed(f"{user_id}.metadata")
    if  not os.path.exists(user_metadata_filepath):
        user_metadata = dict(user_id = user_id, unfunded = True, agreed_TOS = False, look_back = 3, nav_hint_paths = [])     
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

def try_click_on_legal_agreement_agree(messages, user_metadata):
    recent_messages = messages[::-1]
    # If the legal agreement is pulled up, click on it
    for recent_message in recent_messages:
        if has_menu_code(recent_message, "LegalAgreementAgree"):
            return make_click_menu_code_button_webhook_request("LegalAgreementAgree", recent_message, user_metadata)
    # Otherwise, issue a command to open the legal agreement
    return None

def get_simulated_user_webhook_response(args, messages, user_metadata) -> Union[Any,None]:

    # sleep a random amount of time 0-10 seconds
    time.sleep(random.random() * get_sim_setting("user_response_delay_multiplier"))

    # If there are no messages in history, initiate interactions with bot by opening up the legal_agreement
    if len(messages) == 0:
        return make_command_webhook_request('legal_agreement', messages, user_metadata)
    
    if not user_metadata["agreed_TOS"]:
        accept_TOS_click_request = try_click_on_legal_agreement_agree(messages, user_metadata)
        if accept_TOS_click_request is not None:
            user_metadata["agreed_TOS"] = True
            return accept_TOS_click_request
        else:
            return make_command_webhook_request('legal_agreement', messages, user_metadata)

    # Scrape essential data out of messages history.  
    # If essential data is missing, add nav_hint_path that leads to page where it is scrapeable
    try_scrape_metadata_from_messages(messages, user_metadata)

    # Always respond to a reply question if one is being asked
    reply_question = get_reply_question(messages)
    if reply_question:
        return make_response_to_reply_question_webhook_request(reply_question,user_metadata,next_message_id(messages))

    # Otherwise, If there are nav_hints to follow, try to follow them instead of doing anything else.
    nav_hint_followed, response = try_follow_next_nav_hint(messages, user_metadata)
    if nav_hint_followed is not None:
        update_nav_hint_paths(user_metadata, nav_hint_followed)       
        return response

    # If the wallet has never been funded, try to fund it from the simulation funds wallet
    if user_metadata.get("unfunded"):
        try_fund_user_wallet(args, user_metadata)

    # click a random button on a menu if any visible
    recent_menus = get_menus(messages)[-user_metadata.get("look_back"):]
    if len(recent_menus) > 1:
        menu = random.choice(recent_menus)
        return make_click_random_menu_code_button_webhook_request(menu, user_metadata)
    
    # or issues the start command
    return make_command_webhook_request("start", messages, user_metadata)

def try_fund_user_wallet(args, user_metadata):
    allowance = args.user_funding_amt
    funding_wallet_private_key = args.funding_wallet_private_key
    user_wallet = user_metadata.get("wallet_address")
    if user_wallet is not None:
        success = try_transfer_funds_to_user(funding_wallet_private_key, user_wallet, allowance)
        user_metadata["unfunded"] = not success

def try_transfer_funds_to_user(funding_wallet_private_key, user_wallet, allowance):
    try:
        transfer_sol(funding_wallet_private_key, user_wallet, allowance)
        return True
    except Exception as e:
        print(str(e))
        return False

def update_nav_hint_paths(user_metadata, nav_hint_followed):
    if "nav_hint_paths" not in user_metadata:
        return
    nav_hint_paths = user_metadata.get("nav_hint_paths")
    if len(nav_hint_paths) == 0:
        return
    active_nav_path = nav_hint_paths[0]
    if nav_hint_followed not in active_nav_path:
        return
    active_nav_path = active_nav_path[active_nav_path.index(nav_hint_followed)+1:]
    if len(active_nav_path) == 0:
        user_metadata["nav_hint_paths"] = user_metadata["nav_hint_paths"][1:]
    else:
        user_metadata["nav_hint_paths"][0] = active_nav_path

def make_command_webhook_request(command, messages, user_metadata):
    user_id = user_metadata.get("user_id")
    new_message_id = next_message_id(messages)
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
    active_nav_path = next(iter(user_metadata.get("nav_hint_paths")),None)
    if active_nav_path is None:
        return None,None
    for nav_hint in active_nav_path:
        for recent_message in recent_messages:
            if has_menu_code(recent_message, nav_hint):
                return nav_hint, make_click_menu_code_button_webhook_request(nav_hint, recent_message, user_metadata)
    return None, None

def has_menu_code(message, menu_code):
    return menu_code in get_button_menu_codes(message)

def get_button_menu_codes(message, exclude = None):
    exclude = exclude or []
    buttons = get_buttons(message)
    button_menu_codes = [ (button.get("callback_data") or "").split(":")[0] for button in buttons ]
    button_menu_codes = [ button_menu_code for button_menu_code in button_menu_codes if button_menu_code not in exclude ]
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
    return {
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
            "chat": {
                "id": user_id,
                "first_name": "John",
                "last_name": "Doe",
                "username": "johndoe",
                "type": "private"
            },
            "message": message,
            "chat_instance": user_id,
            "data": button["callback_data"]
        }
    }

def make_click_random_menu_code_button_webhook_request(message, user_metadata):
    random_menu_code = random.choice(get_button_menu_codes(message, exclude = ["Close"]))
    return make_click_menu_code_button_webhook_request(random_menu_code, message, user_metadata)

def get_message_id(message) -> Union[int,None]:
    return json_get(message, "message", "message_id") or json_get(message, "message_id")

def get_menus(messages : List[Any]) -> List[Any]:
    return [ message for message in messages if is_menu(message) ]

def is_menu(message) -> bool:
    return len(parse_callback_buttons(message)) > 0

def add_nav_hint_path(user_metadata, path):
    if path not in user_metadata["nav_hint_paths"]:
        user_metadata["nav_hint_paths"].append(path)

def scrape_metadata(user_metadata, messages, key, nav_path, scraper):

    # If the key hasn't been initialized, initialize with None and set a nav_path that results in getting the key
    if key not in user_metadata:
        user_metadata[key] = None
        add_nav_hint_path(user_metadata, nav_path)

    # As long as the data is None, scrape for the data on the current page.
    if user_metadata[key] is None:
        data = scraper(messages)
        if data is not None:
            user_metadata[key] = data

def try_scrape_metadata_from_messages(messages, user_metadata):
    scrape_metadata(user_metadata, messages, "wallet_address", ["Main"], try_get_wallet_address)
    scrape_metadata(user_metadata, messages, "private_key", ["Main","Wallet","View.PK","Wallet","Main"], try_get_private_key)
    scrape_metadata(user_metadata, messages, "balance", ["Main"], try_get_balance)

def try_get_wallet_address(messages):
    for message in messages:
        lines = (message.get("text") or "").splitlines()
        for line in lines:
            # This will match the main menu.
            if ("Wallet" in line) and "<code>" in line and "</code>" in line:
                match : re.Match[str]|None = re.search(r"<code>(?P<wallet>[^<]+)</code>",line)
                if match:
                    return match.group("wallet")
                
def try_get_private_key(messages):
    for message in messages:
        lines = (message.get("text") or "").splitlines()
        for line in lines:
            if '<span class="tg-spoiler">' in line:
                match : re.Match[str]|None = re.search(r'>(?P<private_key>[^<]+)</span>', line)
                if match:
                    return match.group("private_key")

def try_get_balance(messages):
    for message in messages:
        lines = (message.get("text") or "").splitlines()
        for line in lines:
            if 'Wallet SOL Balance' in line:
                match : re.Match[str]|None =  re.search(r"(?P<amt>[0-9₀₁₂₃₄₅₆₇₈₉]+)", line)
                if match:
                    amt : str = match.group("amt")
                    amt = re.sub(r"(?P<subs>0[₀₁₂₃₄₅₆₇₈₉]+)", lambda m: "0"*int(m.group("subs")[1:]), amt)
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
    text = reply_question.get("text").lower()
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
            "reply_to_message": reply_question,
            "text": response
        }
    }


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
        'X-Telegram-Bot-Api-Secret-Token': args.telegram_secret_token,
        'Content-Type': 'application/json'
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
    try:
        messages = load_user_messages(user_id)
        user_metadata = load_user_metadata(user_id)
        orig_user_metadata = deep_clone(user_metadata)
        user_response = get_simulated_user_webhook_response(args, messages, user_metadata)
        if not deep_equals(orig_user_metadata, user_metadata):
            write_user_metadata(user_id, user_metadata)
        send_to_wrangler(user_response, args)
    finally:
        release_file_locks(user_id)

def deep_clone(x):
    return json.loads(json.dumps(x))

def deep_equals(x, y):
    return json.dumps(x, sort_keys=True) == json.dumps(y, sort_keys=True)

def json_get(obj, *props):
    for prop in props:
        if prop not in obj:
            return None
        obj = obj[prop]
    return obj

def next_message_id(messages : List[Any]) -> int:
    return max([x for x in [get_message_id(message) for message in messages] if x is not None ], default = 0) + 1

if __name__ == "__main__":
    args = parse_args()
    acquire_file_locks(args.user_id)
    maybe_attach_debugger("simulated_user", SIMULATED_USER_DEBUG_PORT)
    do_it(args)