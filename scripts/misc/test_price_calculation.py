from argparse import ArgumentParser
import requests, json, os

vsTokenAddress = "So11111111111111111111111111111111111111112"

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--address", type = str, required = False, default = "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk")
    return parser.parse_args()

def get_v6_price_api_price(address : str):
    url = f"https://price.jup.ag/v6/price?ids={address}&vsToken={vsTokenAddress}"
    return ((requests.get(url).json())['data'][address]['price'])

def get_v6_quote_api_price(address : str):
    
    slippageBps = 500 #invoke_v6_quote_api(address, "auto")["computedAutoSlippage"]
    response = invoke_v6_quote_api(address, slippageBps)
    outAmount = response["outAmount"] # address
    inAmount = response["inAmount"] # SOL

    token_decimals = get_token_decimals(address)

    inAmountDecimalized = int(inAmount) / (1 * 10**9)
    outAmountDecimalized = int(outAmount) / (1 * 10**token_decimals)
    price = inAmountDecimalized/outAmountDecimalized
    
    print(f'{price:.20f}')

def get_token_decimals(address):
    if not os.path.exists(".tokens.json"):
        tokens = { entry["address"]: entry for entry in requests.get("https://token.jup.ag/all").json() }
        with open(".tokens.json", "w+") as f:
            json.dump(tokens, f)
    with open(".tokens.json", "r+") as f:
        return json.load(f)[address]["decimals"]

def invoke_v6_quote_api(address : str, slippageBps):
    input_address = vsTokenAddress
    output_address = address
    quote_api_url = "https://quote-api.jup.ag/v6/quote"
    swap_mode = 'ExactIn'
    hasPlatformFee = False
    restrictIntermediateTokens = False
    decimalizedAmount = int(0.1 * 10**9) # 0.1 SOL (small amount so slippage doesn't play as big a role, any smaller and price is distorted)
    url_parts = [
        f"{quote_api_url}?inputMint={input_address}",
        f"&outputMint={output_address}",
        f"&amount={decimalizedAmount}",
        "&autoSlippage=true" if slippageBps == 'auto' else f"&slippageBps={slippageBps}",
        (f"&restrictIntermediateTokens=true" if restrictIntermediateTokens else ''),
        f"&swapMode={swap_mode}"
    ]
    url = "".join(url_parts)
    response = requests.get(url).json()
    return response


def do_it(args):
    price_api_price = get_v6_price_api_price(args.address)
    print(f"{price_api_price:.20f}")
    get_v6_quote_api_price(args.address)

if __name__ == "__main__":
    args = parse_args()
    do_it(args)