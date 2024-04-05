from argparse import ArgumentParser, ArgumentError
import sys, hashlib, requests, datetime, time, hashlib, json, dateutil, dateutil.parser, sqlite3
from typing import Iterable, Tuple, Union
from wrangler_common import get_secret
from tqdm import tqdm

MAX_PULL_CHUNK = 1000
MIN_PROCESS_CHUNK = 50

DB_FILE = ".logs.db"

CREATE_LOGS_TABLE_SQL_1 = """ CREATE TABLE IF NOT EXISTS logs (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        event_id INTEGER NOT NULL,
                                        timestampMS integer NOT NULL,
                                        content text NOT NULL
                                    ); 
"""

CREATE_LOGS_TABLE_SQL_2 = """                                     
                            CREATE INDEX IF NOT EXISTS idx_timestampMS ON logs (timestampMS);
"""

CREATE_LOGS_TABLE_SQL_3 = """
                            CREATE INDEX IF NOT EXISTS idx_event_id ON logs (event_id);
"""

def create_connection():
    """Create a database connection to a SQLite database."""
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        ensure_log_table_exists(conn)
        return conn
    except Exception as e:
        print(str(e))
        return None
    
def ensure_log_table_exists(conn : Union[sqlite3.Connection,None]):
    if conn is None:
        conn = create_connection(DB_FILE)
    if conn is None:
        raise Exception()
    try:
        c = conn.cursor()
        c.execute(CREATE_LOGS_TABLE_SQL_1)
        c.execute(CREATE_LOGS_TABLE_SQL_2)
        c.execute(CREATE_LOGS_TABLE_SQL_3)
    except Exception as e:
        print(str(e))
        print(e)

def insert_log_entry(conn, eventID, timestampMS, log_entry):
    sql = ''' INSERT INTO logs(timestampMS,content)
              VALUES(?,?,?)
              ON CONFLICT(eventID) DO UPDATE SET '''
    cur = conn.cursor()
    cur.execute(sql, eventID, timestampMS, log_entry)
    conn.commit()
    return cur.lastrowid

def insert_log_entries(conn : sqlite3.Connection, log_entries : Iterable[Tuple[int,int,str]]):
    sql = ''' INSERT INTO logs(timestampMS,content)
              VALUES(?,?,?) '''
    cur = conn.executemany(sql, log_entries)
    conn.commit()
    return cur.lastrowid


def maybeTimestampRFC3339(dt : Union[str,None]) -> Union[str,None]:
    if dt is None:
        return None
    try:
        return TimestampRFC3339(dt, noisy = False)
    except Exception as e:
        return None

def TimestampRFC3339(dt : str, noisy = True):
    try:
        # Use dateutil.parser to automatically detect format
        parsed_date = dateutil.parser.parse(dt)
    except ValueError as e:
        if noisy:
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
    parser.add_argument("--start", type = maybeTimestampRFC3339, required = False, default = None)
    parser.add_argument("--end", type = maybeTimestampRFC3339, required = False, default = None)
    parser.add_argument("--limit", type = maybeInt, required = False, default = None)
    args = parser.parse_args()
    return args

def iter_parse_logs(text : str) -> Iterable[Tuple[int,str]]:
    lines = text.splitlines(keepends = False)
    for line in tqdm(lines):
        parsed_log_entry = json.loads(line)
        timestampMS = parsed_log_entry["EventTimestampMs"]
        event_id = hash_to_int(line)
        yield (event_id, timestampMS, parsed_log_entry)

def hash_to_int(line : str):
    line = line.strip()
    hash_bytes = hashlib.sha256(line.encode('utf-8')).digest()
    hash_int = int.from_bytes(hash_bytes, byteorder='big')
    mod_value = 2**31-1
    return hash_int % mod_value

def find_last_max_timestamp_ms(conn : sqlite3.Connection):
    sql = ''' SELECT max(timestampMS) FROM logs'''
    return conn.execute(sql).fetchone()[0]

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

    if start is None:
        start = find_last_max_timestamp_ms() or TimestampRFC3339('1970-01-01')

    if end is None:
        limit = MAX_PULL_CHUNK

    if limit is not None:
        params["limit"] = limit

    if end is not None:
        process_all_logs_in_range(url, headers, params)
    else:
        process_until_few_logs_left(url, headers, params)
        
def process_all_logs_in_range(url, headers, params):
    log_entries = iter_fetch_logs(url,headers,params)
    conn = create_connection()
    insert_in_batches(conn, log_entries)

def process_until_few_logs_left(url, headers, params):
    if params["end"] is None:
        params["end"] = epoch_ms_to_rfc(int(time.time() * 1000))
    has_a_lot = True
    conn = create_connection()
    while has_a_lot:
        params["start"] = get_rfc_max_timestamp_from_db(conn)
        log_entries = iter_fetch_logs(url,headers,params)
        total = insert_in_batches(conn, log_entries)
        if total == 0:
            has_a_lot = False
    print("Done!")

def get_rfc_max_timestamp_from_db(conn : sqlite3.Connection):
    timestamp = find_last_max_timestamp_ms(conn)
    if timestamp is None:
        return epoch_ms_to_rfc(0)
    else:
        return epoch_ms_to_rfc(timestamp)

def epoch_ms_to_rfc(timestamp : int):
    return datetime.datetime.fromtimestamp(timestamp / 1000).isoformat() + 'Z'

def iter_fetch_logs(url,headers,params) -> Iterable[Tuple[int,str]]:
    response = requests.get(url, headers=headers, params = params)
    if not response.ok:
        raise Exception(response.status_code)
    try:
        logs = (response.text)
    except:
        raise Exception("No JSON in response")
    return iter_parse_logs(list(logs))

def insert_in_batches(conn : sqlite3.Connection, log_entries : Iterable[Tuple[int,int,str]]) -> int:
    batch = []
    count = 0
    for log_entry in log_entries:
        count += 1
        maxTimestampMS = max(log_entry[0],maxTimestampMS)
        batch.append(log_entry)
        if len(batch) >= 100:
            print(f"Inserting batch of {len(batch)}")
            insert_log_entries(conn, batch)
            print("   Done.")
            batch = []
    return count
    



if __name__ == "__main__":
    print(sys.argv)
    args = parse_args()
    env = args.env.strip()
    start = args.start
    end = args.end
    limit = args.limit
    do_it(env, start, end, limit)