import os, json
from typing import List, Iterable, Any
from glob import glob
from flask import Flask, request, jsonify
from dev.local_dev_common import pathed, sim_dir

css = """
<style type="text/css">

body {
    background-color: green;
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
    background-color: light-blue;
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    border: 1px solid black;
    border-radius: 4px;
}
</style>
"""

app = Flask(__name__)

@app.route("/<int:user_id>", methods = ['GET'])
def view_user(user_id : int):
    messages = get_user_messages(user_id)
    html = render_user_messages(user_id, messages)
    return html

def render_user_messages(user_id : int, messages : List[Any]):
    body = []
    for message in messages:
        body.append(render_user_message(user_id, message))
    return make_html_doc(os.sep.join(body),True,user_id)

def render_user_message(user_id, message):
    text = message.get("text") or (message.get("message") or dict()).get("text") or ""
    text = text.replace("\r\n", "<br/>").replace("\r", "<br/>").replace("\n", "<br/>")
    keyboard = (message.get("reply_markup") or dict()).get("inline_keyboard") or []
    keyboard_markup = render_keyboard(keyboard)
    return f"""<div class='message' id='{user_id}'>
        <div class='message-text'>{text}</div>
        <div class='keyboard'>{keyboard_markup}</div>
    </div><br/><hr/><br/>"""

def render_keyboard(keyboard):
    keyboard_markup = ""
    for line in keyboard:
        keyboard_markup += f"<div class='keyboard-line'>"
        width = 100/len(line)
        for button in line:
            keyboard_markup += f"<div class='button' style='width:{width}%'>{button.get("text")}</div>"
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

def make_html_doc(body, auto_refresh, user_id):
    if auto_refresh:
        maybe_auto_refresh = f"""
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
        maybe_auto_refresh = ""
    return f"""<html>
    <head>
    {maybe_auto_refresh}
    {css}
    </head>
    <body>{body}</body>
</html>"""

if __name__ == "__main__":
    app.run(debug = True, port = 8082)