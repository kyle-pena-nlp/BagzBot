from argparse import ArgumentParser
import time, requests, json, time, datetime

SOL_ADDRESS = "So11111111111111111111111111111111111111112"

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--frequency", type = int, required = True)
    parser.add_argument("--token", type = str, required = True)
    args = parser.parse_args()
    return args

def do_it(args):
    url = f'https://price.jup.ag/v6/price?ids={args.token.strip()}&vsToken={SOL_ADDRESS}'
    initial_price = None
    last_price = None
    max_price = None
    while True:
        try:
            
            response = requests.get(url)
            responseBody = response.json()
            price = responseBody["data"][args.token.strip()]["price"]
            if initial_price is None:
                initial_price = price
            if max_price is None or price > max_price:
                max_price = price
            initial_price_pct_delta = 100 * (price - initial_price) / initial_price 
            max_price_pct_delta = 100 * (max_price - price) / max_price
            last_price_pct_delta = 0 if last_price is None else 100 * (price - last_price)/last_price
            print(datetime.datetime.now(), f"{price:<14}", f"{max_price_pct_delta:>5.2f}%", f"{last_price_pct_delta:>5.2f}%")
            last_price = price
        except Exception as e:
            print("_scheduled invocation failed: " + str(e))
        finally:
            time.sleep(args.frequency)


if __name__ == "__main__":
    args = parse_args()
    do_it(args)