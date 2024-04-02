import requests
from wrangler_common import get_environment_variable, make_telegram_api_method_url


def configure_bot_info(env : str):
    
    
    bot_displayname = get_environment_variable("TELEGRAM_BOT_DISPLAY_NAME", env)
    bot_instance_displayname = get_environment_variable("TELEGRAM_BOT_INSTANCE_DISPLAY_NAME", env)
    bot_fullname = f"{bot_displayname} - {bot_instance_displayname}"
    setmyname_url = make_telegram_api_method_url("setMyName", env)
    response = requests.post(setmyname_url, json = { "name": bot_fullname })
    if not response.ok:
        raise Exception(f"Problem with {setmyname_url}")

    bot_tagline = get_environment_variable("TELEGRAM_BOT_TAGLINE", env)
    setmydescription_url = make_telegram_api_method_url("setMyDescription", env)
    response = requests.post(setmydescription_url, json = { "description": bot_tagline })
    if not response.ok:
        raise Exception(f"Problem with {setmydescription_url}")

    setmyshortdescription_url = make_telegram_api_method_url("setMyShortDescription", env)
    response = requests.post(setmyshortdescription_url, json = { "short_description": bot_tagline })
    if not response.ok:
        raise Exception(f"Problem with {setmydescription_url}")