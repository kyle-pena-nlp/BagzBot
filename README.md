# SolSentry
© 2024, ExpressionTek LLC.

A Solana Telegram bot offering unique trade types for users who want better features.

## Legal

### Confidentiality

You are required to:

- Maintain the confidentiality of all disclosed information.
- Not disclose, share, or disseminate information to any third party without prior written consent.

Disclosure of the contents of this repository without express consent can cause irreparable harm and significant material damage to our company. Should you breach these confidentiality obligations, we reserve the right to pursue all available legal remedies, including but not limited to:

- Seeking injunctive relief to prevent further breaches and to protect the confidentiality of the disclosed information.
- Pursuing damages, including consequential damages, against any party responsible for the breach of these terms.

### Acknowledgment of Terms

By accessing this repository, you acknowledge that you have read, understood, and agreed to abide by these non-disclosure obligations. You also acknowledge that the unauthorized disclosure of confidential information from this repository could cause irreparable harm to our company for which we will seek full legal redress.

## Description

SolSentry is hosted on CloudFlare.
A Telegram bot is configured to invoke a CloudFlare worker via webhook whenever a user interacts with the bot.  The CloudFlare worker delegates actions to Durable Objects for processing and storage.  It interacts with the blockchain via RPC, and uses Jupiter to get swap routes (although it will expand to non-Jupiter as well in the future).

## Getting Started

Install node.js
Install python
npm i -g npx
npm install .
(MacOS) Alias python to python3 in your .bash_profile, .bashrc, and .zshrc

You'll have to run this command once manually to answer an annoying 'first-time' question from wrangler:
npx wrangler dev --env=dev --port=8443 --test-scheduled --ip 127.0.0.1 --var TELEGRAM_BOT_SERVER_URL:"http://127.0.0.1:80"

Clone and setup this repository, and make sure the telegram-bot-api command is ready to be used.
https://github.com/tdlib/telegram-bot-api

This may help: 
https://tdlib.github.io/telegram-bot-api/build.html?os=macOS
`


### Dependencies

Runtime Dependencies:
* @solana/web3.js
* bs58

TS Dev Dependencies:
* jest
* wrangler
* @cloudflare/workers-types

Other:
    mitmproxy (`brew install mitmproxy` for MacOS)

Python Scripting Dependencies:
* tomli
* tqdm
* requests
* psutil
* mitmproxy
* solana (that's the name of the pypi project)

Please note: Later versions of wrangler (1.19+) have a broken debugger.  I am intentionally using 1.18 until that's fixed.

### Installing

* pip install the python dev dependencies
* npm install the project

### Running Locally

* The project relies on heavily gitignored files containing API access keys.  Those are team-only and will not be distributed.
* Assuming you have API access keys, you run: `python scripts/start_dev_box.py` to spin up the processes needed to run locally (including simulating CRON jobs that would run on CloudFlare's infrastructure)

### Load Testing

Run python scripts/run_simulator.py (with required arguments supplied)
Please note that load tests require a single wallet to be funded with sufficient SOL to run the test.
That means that load tests cost real money (albeit only in tx fees)
Platform fee collection can be disabled via parameter to scripts/run_simulator.py
(Otherwise, you can simply collect the platform fees out of the fee wallet)

### Deploying

* If you are a team member talk to your project lead


### Other
You may wish to disable VSCode's hardware acceleration on macs to avoid annoying typing/rendering issues.
Add:
    "disable-hardware-acceleration": true
To:
    ~/.vscode/argv.json

