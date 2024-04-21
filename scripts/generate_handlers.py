import os, re, json
from typing import List
from argparse import ArgumentParser

MENU_CODE_PATTERN = f"^\s+(?P<MENU_CODE>[^\s]+)\s*=\s*(?P<LITERAL>[^\s]+)\s*(\/\/.*)?$"

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--overwrite", action = "store_true")
    return parser.parse_args()

def get_menu_codes() -> List[str]:
    with open("./menus/menu_code.ts", "r+") as f:
        lines = [line for line in f.readlines() if re.match(MENU_CODE_PATTERN, line)]
    menuCodes = [re.match(MENU_CODE_PATTERN, line).groupdict().get("MENU_CODE") for line in lines ]
    return menuCodes

def generate_files(menuCodes : List[str], overwrite : bool):
    for menuCode in menuCodes:
        out_filepath = f"./worker/handlers/{snake_case_of(menuCode)}_handler.ts"
        if os.path.exists(out_filepath) and not overwrite:
            print("Skipping writing to {out_filepath} because args.overwrite==False")
            continue
        file_contents = generate_file_contents(menuCode)
        with open(out_filepath, "w+") as f:
            f.write(file_contents)

def generate_file_contents(menuCode : str):
    template = '''import * as Menus from "../../menus";
import * as Util from "../../util";
import { BaseMenuCodeHandler } from "./base_menu_code_handler";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { TGStatusMessage, TGMessageChannel } from "../../telegram";
import { logError, logDebug, logInfo } from "../../logging";
import { readSessionObj, storeSessionObj, storeSessionObjProperty } from "../../durable_objects/user/userDO_interop";

export class ~MENU_CODE~Handler extends BaseMenuCodeHandler<MenuCode.~MENU_CODE~> {
    constructor(menuCode : MenuCode.~MENU_CODE~) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
~IMPL~
    }
}
'''
    extracted_case_statement = extract_case_statement(menuCode)
    print(extracted_case_statement)
    extras_lines = []
    if ('callbackData' in extracted_case_statement and 'params.callbackData' not in extracted_case_statement):
        extras_lines.append('const callbackData = params.callbackData;')
    if ('messageID' in extracted_case_statement and 'params.messageID'  not in extracted_case_statement):
        extras_lines.append('const messageID = params.messageID;')
    if len(extras_lines) > 0:
        extras_lines = [ "        " + extra_line for extra_line in extras_lines ]
        extracted_case_statement = "\n".join(extras_lines) + "\n" + extracted_case_statement
    template = template.replace('~MENU_CODE~', menuCode)
    template = template.replace('~IMPL~', extracted_case_statement)
    return template


def extract_case_statement(menuCode):
    THIS_MENU_CODE_CASE_STATEMENT = r"^\s+case\s+MenuCode\." + menuCode + r":\s*(\/\/.+)?$"
    MENU_CODE_CASE_STATEMENT = r"^\s+case\s+MenuCode\.[^:]+:\s*(\/\/.+)?$"
    print(THIS_MENU_CODE_CASE_STATEMENT)
    with open("./worker/handler.ts", "r") as f:
        lines = f.readlines()
    case_statement_lines : List[str] = []
    capturing = False
    for line in lines:
        if re.match(THIS_MENU_CODE_CASE_STATEMENT, line):
            capturing = True
        elif re.match(MENU_CODE_CASE_STATEMENT, line):
            capturing = False
        elif capturing:
            case_statement_lines.append(line)
    if len(case_statement_lines) == 0:
        raise Exception()
    case_statement_content = "".join([ dedent(line) for line in case_statement_lines ])
    case_statement_content = re.sub(r"\s+$", "", case_statement_content, flags = re.M)
    case_statement_content = re.sub(r"\bthis\.env\b","env",case_statement_content)
    case_statement_content = re.sub(r"\bthis\.context\b","context",case_statement_content)
    case_statement_content = case_statement_content.replace("new Menu", "new Menus.Menu")
    case_statement_content = case_statement_content.replace("strictParseInt",     "Util.strictParseInt")
    case_statement_content = case_statement_content.replace("strictParseFloat",   "Util.strictParseFloat")
    case_statement_content = case_statement_content.replace("strictParseBoolean", "Util.strictParseBoolean")
    case_statement_content = case_statement_content.replace("maybeParseInt",     "Util.maybeParseInt")
    case_statement_content = case_statement_content.replace("maybeParseFloat",   "Util.maybeParseFloat")
    case_statement_content = case_statement_content.replace("maybeParseBoolean", "Util.maybeParseBoolean")  
    case_statement_content = case_statement_content.replace("tryParseInt",     "Util.tryParseInt")
    case_statement_content = case_statement_content.replace("tryParseFloat",   "Util.tryParseFloat")
    case_statement_content = case_statement_content.replace("tryParseBoolean", "Util.tryParseBoolean")      
    case_statement_content = case_statement_content.replace("QUESTION_TIMEOUT_MS", "Util.strictParseInt(this.env.QUESTION_TIMEOUT_MS)")
    return case_statement_content

def dedent(line : str) -> str:
    return re.sub("^        ","",line)

def snake_case_of(menuCode : str) -> str:
    snake_cased = ""
    for char in menuCode:
        if char.upper() == char and len(snake_cased) > 0:
            snake_cased = snake_cased + "_" + char.lower()
        elif char.upper() == char:
            snake_cased = snake_cased + char.lower()
        else:
            snake_cased = snake_cased + char
    return snake_cased

def generate_index_ts(menuCodes : List[str]):
    lines : List[str] = []
    for menuCode in menuCodes:
        lines.append(f'import {{ {menuCode}Handler }} from "./{snake_case_of(menuCode)}_handler"')
    exports = [ f'{menuCode}Handler' for menuCode in menuCodes ]
    export_batches = batch(exports,10)
    export_lines = [ ", ".join(batch) for batch in export_batches ]
    things = "\n,".join(export_lines)
    lines.append(f"export {{ {things} }}")
    with open("./worker/handlers/index.ts", "w+") as f:
        f.write("\n".join(lines))

def batch(things : List[any], batch_size : int) -> List[List[any]]:
    batches = []
    batch = []
    for thing in things:
        batch.append(thing)
        if len(batch) >= batch_size:
            batches.append(batch)
            batch = []
    if len(batch) > 0:
        batches.append(batch)
    return batches

def generate_handler_map(menuCodes : List[str]):

    handler_lines : List[str] = []
    for menuCode in menuCodes:
        handler_lines.append(f'[MenuCode.{menuCode}]: new handlers.{menuCode}Handler(MenuCode.{menuCode}),')

    template = '''import { MenuCode } from "../menus";
import { HandlerMap } from "../util";
import { BaseMenuCodeHandler } from "./handlers/base_menu_code_handler";
import * as handlers from "./handlers";

export const MenuCodeHandlerMap : HandlerMap<MenuCode,BaseMenuCodeHandler<MenuCode>> = {
~HANDLERS~
}
'''
    template = template.replace('~HANDLERS~', "\n".join([ '    ' + handler_line for handler_line in handler_lines ]))
    with  open("./worker/menu_code_handler_map.ts", "w+") as f:
        f.write(template)

def do_it(args):
    menuCodes = get_menu_codes()
    generate_files(menuCodes, args.overwrite)
    generate_index_ts(menuCodes)
    generate_handler_map(menuCodes)

if __name__ == "__main__":
    args = parse_args()
    do_it(args)