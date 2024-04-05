from argparse import ArgumentParser, ArgumentError
from typing import Union
import requests
import dateutil
import dateutil.parser
import sqlite3
from wrangler_common import get_secret
import sys

DB_FILE = ".logs.db"

CREATE_LOGS_TABLE_SQL = """ CREATE TABLE IF NOT EXISTS logs (
                                        id integer PRIMARY KEY,
                                        content text NOT NULL
                                    ); """

def create_connection():
    """Create a database connection to a SQLite database."""
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        return conn
    except Exception as e:
        return None
    
def ensure_log_table_exists():
    conn = create_connection(DB_FILE)
    if conn is None:
        return
    try:
        c = conn.cursor()
        c.execute(CREATE_LOGS_TABLE_SQL)
    except Exception as e:
        print(e)

def insert_log_entry(conn, log_entry):
    sql = ''' INSERT INTO logs(content)
              VALUES(?) '''
    cur = conn.cursor()
    cur.execute(sql, log_entry)
    conn.commit()
    return cur.lastrowid

def TimestampRFC3339(dt : str):
    try:
        # Use dateutil.parser to automatically detect format
        parsed_date = dateutil.parser.parse(dt)
    except ValueError as e:
        print(str(e))
        raise ArgumentError(dt)
    
    # Convert to RFC 3339 format
    rfc3339_date = parsed_date.isoformat("T") + "Z"
    return rfc3339_date

def maybeInt(integer : str) -> Union[int,None]:
    if integer is None or integer.strip() == '':
        return None
    try:
        return int(integer)
    except:
        raise ArgumentError(integer)

def parse_args():
    parser = ArgumentParser()
    parser.add_argument("--env", type = str, required = True)
    parser.add_argument("--start", type = TimestampRFC3339, required = True)
    parser.add_argument("--end", type = TimestampRFC3339, required = True)
    parser.add_argument("--limit", type = maybeInt, required = False, default = None)
    args = parser.parse_args()
    return args

def do_it(env : str, start : str, end : str, limit : Union[int,None]):

    account_id = get_secret("SECRET_R2_ACCOUNT_ID", env)

    url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/logs/retrieve'

    email = get_secret("SECRET__EMAIL", env)
    api_key = get_secret("SECRET__CF_API_KEY", env)
    r2_access_key_id = get_secret("SECRET__R2_LOGPUSH1_ACCESS_KEY", env)
    r2_secret_access_key = get_secret("SECRET__R2_LOGPUSH1_SECRET_ACCESS_KEY", env)

    headers = {
        "X-Auth-Email": email,
        "X-Auth-Key": api_key,
        "R2-Access-Key-Id": r2_access_key_id,
        "R2-Secret-Access-Key": r2_secret_access_key
    }

    bucket = get_secret("SECRET__R2_LOGPUSH1_BUCKET", env)

    params = {
        "start": start,
        "end": end,
        "bucket": bucket
    }

    if limit is not None:
        params["limit"] = limit

    response = requests.get(url, headers=headers, params = params)

    if not response.ok:
        raise Exception(response.status_code)

    try:
        logs = (response.json())
    except:
        raise Exception("No JSON in response")

    conn = create_connection()
    for log_entry in logs:
        insert_log_entry(conn, log_entry)

if __name__ == "__main__":
    print(sys.argv)
    args = parse_args()
    env = args.env.strip()
    start = args.start.strip()
    end = args.end.strip()
    limit = args.limit
    do_it(env, start, end, limit)