from mitmproxy import http
from dev.local_dev_common import FAKE_TELEGRAM_SERVER_PORT


def request(flow: http.HTTPFlow) -> None:
    if "api.telegram.org" in flow.request.pretty_url:
        flow.request.host = "localhost"
        flow.request.port = FAKE_TELEGRAM_SERVER_PORT