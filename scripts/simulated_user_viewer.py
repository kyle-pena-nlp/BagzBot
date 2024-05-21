from argparse import ArgumentParser
import os, json
from typing import List, Iterable, Any
from glob import glob
from flask import Flask, request, jsonify
from dev.local_dev_common import LOCAL_CLOUDFLARE_WORKER_URL, pathed, sim_dir
from wrangler_common import get_secret

SIMULATED_USER_VIEWER_PORT = 8082

css = """
    <style type="text/css">

    body {
        background-color: green;
    }

    .callback-data {
        display: none;
    }

    .message-payload {
        display: none;
    }

    .message {
        background: white;
        width: 75%;
        margin-right: auto;
    }

    .message-text {
        padding: 5px;
        border: 1px solid black;
    }

    .keyboard {
    }

    .keyboard-line {
        display: flex;
        width: 100%;
        height: 20px;
    }

    .button {
        cursor: pointer;
        background-color: light-blue;
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        text-align: center;
        border: 1px solid black;
        border-radius: 4px;
    }

    .button:hover {
        filter: alpha(opacity=60);
        opacity: 0.6;
    }

    </style>
"""

def make_scripts_tag(user_id, wrangler_url, telegram_bot_api_secret_token):

    script_tag = f"""
    <script type='text/javascript'>

        function makeCallbackPayload(userID, callbackData, message) {{
            return {{
                "update_id": 123456789,
                "callback_query": {{
                    "id": "4382abcdef",
                    "from": {{
                        "id": userID,
                        "is_bot": false,
                        "first_name": "UserID",
                        "last_name": userID,
                        "username": "UserID" + userID.toString(10),
                        "language_code": "en"
                    }},
                    "chat": {{
                        "id": userID,
                        "first_name": "John",
                        "last_name": "Doe",
                        "username": "johndoe",
                        "type": "private"
                    }},
                    "message": message,
                    "chat_instance": userID,
                    "data": callbackData
                }}
            }}
        }}

        document.addEventListener('DOMContentLoaded', function() {{
        
            document.body.addEventListener('click', function(event) {{
                if (event.target.closest('.button')) {{
                    const buttonDiv = event.target.closest('.button');
                    const callbackDataContainer = buttonDiv.querySelector('.callback-data');
                    const messagePayload = buttonDiv.closest('.message').querySelector('.message-payload');
                    console.log(messagePayload.textContent)
                    if (callbackDataContainer) {{
                        const callbackData = callbackDataContainer.textContent;
                        const xhr = new XMLHttpRequest();
                        const url = '{wrangler_url}';
                        const callback_payload = makeCallbackPayload({user_id}, callbackData, messagePayload.textContent);
                        xhr.open('POST', url, true);
                        xhr.setRequestHeader('Content-Type', 'application/json');
                        xhr.setRequestHeader('X-Telegram-Bot-Api-Secret-Token', '{telegram_bot_api_secret_token}');
                        xhr.send(callback_payload);
                    }}
                }}
            }});

            function sendReplyQuestionAnswer(inputValue) {{
                console.log(inputValue);
            }}

            document.querySelectorAll('.submitButton').forEach(button => {{
                button.addEventListener('click', function() {{
                    const inputValue = this.previousElementSibling.value;
                    sendReplyQuestionAnswer(inputValue);
                }});
            }});

        }});
    </script>
    """
    return script_tag

app = Flask(__name__)

args = dict()

@app.route("/<int:user_id>", methods = ['GET'])
def view_user(user_id : int):
    messages = get_user_messages(user_id)
    html = render_user_messages(user_id, messages, args.get("auto_refresh") or False)
    return html

def render_user_messages(user_id : int, messages : List[Any], auto_refresh : bool):
    body = []
    for message in messages:
        body.append(render_user_message(user_id, message))
    return make_html_doc(os.sep.join(body),auto_refresh,user_id)

def render_user_message(user_id, message):
    text = message.get("text") or (message.get("message") or dict()).get("text") or ""
    text = text.replace("\r\n", "<br/>").replace("\r", "<br/>").replace("\n", "<br/>")
    keyboard = (message.get("reply_markup") or dict()).get("inline_keyboard") or []
    maybe_reply_question_input_box = make_reply_question_input_box(message)
    message_payload = json.dumps(message)
    keyboard_markup = render_keyboard(keyboard)
    return f"""<div class='message' id='{user_id}'>
        <div class='message-payload'>{message_payload}</div>
        <div class='message-text'>{text}</div>
        <div class='keyboard'>{keyboard_markup}</div>
        {maybe_reply_question_input_box}
    </div><br/><hr/><br/>"""

def make_reply_question_input_box(message):
    is_reply_question = (message.get("reply_markup") or dict()).get("force_reply") or False
    if is_reply_question:
        return '<input type="text" placeholder="Enter text here"><button type="submit">Submit</button>'
    else:
        return ''

def render_keyboard(keyboard):
    keyboard_markup = ""
    for line in keyboard:
        keyboard_markup += f"<div class='keyboard-line'>"
        width = 100/len(line)
        for button in line:
            keyboard_markup += f"<div class='button' style='width:{width}%'>{button.get("text")}<span class='callback-data'>{button.get("callback_data")}</span></div>"
        keyboard_markup += "</div>"
    return keyboard_markup


@app.route("/", methods = ["GET"])
def list_users():
    user_ids_iter = iter_user_ids()
    html = render_user_ids(user_ids_iter)
    return html

def get_user_messages(user_id):
    user_messages_fp = pathed(f"{user_id}.messages")
    if os.path.exists(user_messages_fp):
        with open(user_messages_fp, "r+") as f:
            return json.load(f)
    else:
        return []
    
def iter_user_ids():
    user_message_fps = glob(os.path.join(sim_dir(), "*.messages"))
    for user_message_fp in user_message_fps:
        user_id = int(os.path.splitext(os.path.basename(user_message_fp))[0])
        yield user_id

def render_user_ids(user_ids : Iterable[int]) -> str:
    html = []
    for user_id in user_ids:
        html.append(f"<a href='/{user_id}'>View {user_id}</a>")
    return make_html_doc(os.sep.join(html),False,0)

def make_auto_refresh_script(auto_refresh : bool):
    if auto_refresh:
        return f"""
                <script type='text/javascript'>

                    function scrollToBottom() {{
                        window.scrollTo(0, document.body.scrollHeight);
                    }}

                    window.onload = function() {{
                        scrollToBottom();
                    }};

                    function refresh() {{
                        location.reload()
                    }}

                    setTimeout(refresh, 5000);
                </script>
        """
    else:
        return ""

def make_html_doc(body, auto_refresh, user_id):
    maybe_auto_refresh = make_auto_refresh_script(auto_refresh)
    wrangler_url = LOCAL_CLOUDFLARE_WORKER_URL
    telegram_bot_api_secret_token = get_secret("SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN", "sim")
    
    return f"""<html>
        <head>
        {maybe_auto_refresh}
        {css}
        {make_scripts_tag(user_id, wrangler_url, telegram_bot_api_secret_token)}
        </head>
        <body>{body}</body>
    </html>"""

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--auto_refresh", action="store_true")
    parsed_args = parser.parse_args()
    args.update(vars(parsed_args))

if __name__ == "__main__":
    parse_args()
    app.run(debug = True, port = SIMULATED_USER_VIEWER_PORT)