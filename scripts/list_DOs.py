import requests, json

from wrangler_common import get_environment_variable, get_secret

account_id = get_secret("SECRET_R2_ACCOUNT_ID", "beta")
api_token = get_secret("SECRET__CF_API_KEY", "beta")
email = get_secret("SECRET__EMAIL", "beta")
desired_type = 'UserDO'  # The type you want to filter by
do_name = "UserDO"
worker_name = 'sol-sentry-bot-beta'
name = f"{worker_name}_{do_name}"

url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/durable_objects/namespaces"

headers = {
    "Authorization": f"Bearer {api_token}",
    'X-Auth-Key': f"{api_token}",
    'X-Auth-Email': f"{email}",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
if (response.status_code != 200):
    raise Exception("Error:", response.status_code, response.text)
    

response = response.json()
#print(json.dumps(response, indent = 1))
#print("="*50)
namespaces = response.get('result', [])


print(len([ns for ns in namespaces if ns['name'] == name]))
ns_id = [ns for ns in namespaces if ns['name'] == name][0]["id"]

obj_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/durable_objects/namespaces/{ns_id}/objects"

response = requests.get(obj_url, headers=headers)
if (response.status_code != 200):
    raise Exception("Error:", response.status_code, response.text)
    
objs = response.json()#.get('result',[])



#print(json.dumps(objs, indent = 1))

ids = [ obj["id"] for obj in objs.get("result",[]) ]
print("\r\n".join(ids))
