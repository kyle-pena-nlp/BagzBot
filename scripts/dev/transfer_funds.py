from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solana.rpc.api import Client
from solana.transaction import Transaction

def transfer_sol(sender_keypair: Keypair, receiver_pubkey_str: str, amount_sol: float):
    
    # Connect to Solana mainnet
    client = Client("https://api.mainnet-beta.solana.com")

    # Receiver's public key
    receiver_pubkey = Pubkey(receiver_pubkey_str)

    # Calculate the amount in lamports (the smallest unit of SOL)
    lamports = int(amount_sol * 1_000_000_000)  # 1 SOL = 1 billion lamports

    # Create a transfer instruction
    transfer_instr = transfer(TransferParams(
        from_pubkey=sender_keypair.public_key,
        to_pubkey=receiver_pubkey,
        lamports=lamports
    ))

    # Create a transaction
    transaction = Transaction()
    transaction.add(transfer_instr)

    # Send the transaction
    response = client.send_transaction(transaction, sender_keypair)
    return response