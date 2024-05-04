from flask import Flask, request, jsonify
import os, json, time
from argparse import ArgumentParser
from dev.local_dev_common import *

"""

    The purpose of this server is to provide a miniature fake telegram implementation

    It is used to stand in for the telegram server, in order to perform simulation / load testing.

    We handle calls made by the CF worker to telegram, including:
        sendMessage
        editMessageText
        deleteMessage
    
    
    It interprets these calls and writes changes indicated by them out to {user_id}.messages files.

    Separately (not in this file), I am watching for changes to these files and simulating the user's "reaction" to the message

    Note: For simplicity, i assume that the chat_id is the same as the user_id
        (Thus, you may see lines like user_id = body.chat_id - and that's ok)
"""

app = Flask(__name__)

"""
    /deleteMessage
"""


@app.route('/deleteMessage', methods=['POST'])
def handleDeleteMessage():
    found = delete_message_from_user_file(request)
    return jsonify(make_delete_message_response(found))

def delete_message_from_user_file(request):
    message_id_to_delete = request.message_id
    user_id = get_user_id(request)
    messages = get_user_messages(user_id)
    messages = [ message for message in messages if message["message_id"] == message_id_to_delete ]
    write_user_messages(messages)

def make_delete_message_response(found):
    if found:
        return {
           "ok": True,
            "result": True
        }
    else:
        return {
            "ok": False,
            "error_code": 400,
            "description": "Bad Request: message can't be deleted"
        }

def get_message_id_from_message_in_user_file(message):
    return message["message_id"]


"""
    /editMessageText
    Locate the message from the user file and overwrite,
    then write the contents of the user file back to disk
"""

@app.route('/editMessageText', methods=['POST'])
def handleEditMessageText():
    found = edit_message_in_user_file(request)
    return jsonify(make_edit_message_response(request, found))

def edit_message_in_user_file(request):
    edit_message_request = request.json
    user_id = get_user_id(edit_message_request)
    messages = get_user_messages(user_id)
    
    # find the message and overwrite it
    found = False
    for message in messages:
        if message.get('message_id') == edit_message_request.get('message_id'):
            found = True
            message.clear()
            message.update(edit_message_request)
    write_user_messages(messages, user_id)

    return found

def make_edit_message_response(request, found : bool):
    if found:
        return {
            "ok": True,
            "result": {
                "message_id": request["message_id"],
                "from": {
                    "id": get_user_id(request),
                    "is_bot": True,
                    "first_name": "BotName"
                },
                "chat": {
                    "id": get_user_id(request),
                    "first_name": "UserName",
                    "type": "private"
                },
                "date": int(time.time()),
                "text": request["text"]
            }
        }
    else:
        return {
            "ok": False,
            "error_code": 400,
            "description": "Bad Request: message can't be edited"
        }

@app.route('/sendMessage', methods=['POST'])
def handleSendMessage():
    if is_reply_question(request):
        message_id = append_reply_question_to_user_file(request)
        return jsonify(make_reply_question_response(request, message_id))
    else:
        message_id = append_message_to_user_file(request)
        return jsonify(make_send_message_response(request, message_id))

def is_reply_question(request):
    return "reply_markup" in request and "force_reply" in request["reply_markup"] and request["reply_markup"]["force_reply"]

def append_message_to_user_file(request) -> int:
    new_message = request.json
    user_id = get_user_id(new_message)
    messages = get_user_messages(user_id)
    greated_message_id = max([ message["message_id"] for message in messages ], default = 0)
    new_message_id = greated_message_id + 1
    new_message["message_id"] = new_message_id
    messages.append(new_message)
    write_user_messages(messages)
    return greated_message_id

def make_send_message_response(request, message_id):
    return {
        "ok": True,
        "result": {
            "message_id": message_id,
            "from": {
                "id": get_user_id(request),
                "is_bot": True,
                "first_name": "BotName"
            },
            "chat": {
                "id": get_user_id(request),
                "first_name": "UserName",
                "type": "private"
            },
            "date": int(time.time()),
            "text": request["text"]
        }
    }



def append_reply_question_to_user_file(request):
    return append_message_to_user_file(request)

def make_reply_question_response(request, message_id):
    return make_send_message_response(request, message_id)

def get_user_id(body):
    # This is a simplification where i assume user_ud and chat_id have the same value.
    # Thus in requests to the TG Bot API that lack a user_id in the request body, I can use the chat_id instead
    return body.get("user_id") or body.get("chat_id")

def get_user_messages(user_id):
    # Build the file path
    filename = pathed(f"{user_id}.messages")
    if os.path.exists(filename):
        with open(filename, 'r') as file:
            data = json.load(file)
    else:
        data = []
    return data

def write_user_messages(user_id, data):
    # Write the updated data back to the file
    filename = pathed(f"{user_id}.messages")
    with open(filename, 'w') as file:
        json.dump(data, file, indent=4)

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--attach_debugger", type = parse_bool, required = False, default = False)
    return parser.parse_args()

if __name__ == '__main__':

    args = parse_args()
    if args.attach_debugger:
        attach_debugger(FAKE_TELEGRAM_DEBUG_PORT)
    
    app.run(debug=False, host = "localhost", port = FAKE_TELEGRAM_SERVER_PORT)