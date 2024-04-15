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

### Dependencies

Runtime Dependencies:
* @solana/web3.js
* bs58

TS Dev Dependencies:
* jest
* wrangler
* @cloudflare/workers-types

Python Scripting Dependencies:
* tomli
* tqdm

Please note: Later versions of wrangler (1.19
+) have a broken debugger.  I am intentionally using 1.18 until that's fixed.

### Installing

* pip install the python dev dependencies
* npm install the project

### Running Locally

* The project relies on heavily gitignored files containing API access keys.  Those are team-only and will not be distributed.
* Assuming you have API access keys, you run: `python scripts/start_dev_box.py` to spin up the processes needed to run locally (including simulating CRON jobs that would run on CloudFlare's infrastructure)

### Deploying

* If you are a team member talk to your project lead

