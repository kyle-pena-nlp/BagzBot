import json, subprocess, re

LOGIN_COMMAND                         = "npx wrangler login"
FETCH_KV_COMMAND                      = "npx wrangler kv:key --namespace-id={namespace_id} get {key}"
LIST_NAMESPACE_COMMAND                = "npx wrangler kv:namespace list"

def do_wrangler_login():
    subprocess.run(LOGIN_COMMAND,                    
                     check = True, 
                     shell = True)   
    

def _parse_toml_line(line):
    match = re.match(r'(?P<key>[^\s]+)\s*=\s*("(?P<value1>[^"]+)"|(?P<value2>[^\s]+))', line.strip())
    if not match:
        return None
    else:
        groups = match.groupdict()
        key = groups.get("key")
        value = groups.get("value1") or groups.get("value2")
        return key.strip(), value.strip()

def get_var_from_dev_vars(key):
    with open(".dev.vars.dev", "r+") as f:
        kvs = [ _parse_toml_line(line) for line in f.readlines() ]
        env_vars = { kv[0]: kv[1] for kv in kvs if kv is not None }
        return env_vars.get(key)

def get_KV_from_cloudflare(namespace_id, key):
    value = subprocess.run(FETCH_KV_COMMAND.format(key=key, namespace_id=namespace_id), 
                     check = True, 
                     shell = True,
                     capture_output = True,
                     text = True).stdout
    return value

def get_namespace_id(env):
    result = subprocess.run(LIST_NAMESPACE_COMMAND, 
                   check = True, 
                   shell = True,
                   capture_output = True,
                   text = True)
    if result.returncode != 0:
        raise Exception("Nonzero returncode for LIST_NAMESPACE_COMMAND")
    namespaces = json.loads(result.stdout)
    namespaces = { namespace["title"]:  namespace for namespace in namespaces }
    if env not in namespaces:
        raise Exception(f"No namespace called {env}")
    return namespaces[env]["id"]
    
