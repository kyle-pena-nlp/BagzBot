import * as crypto from "node:crypto";
import * as bs58 from "bs58";
import * as web3 from '@solana/web3.js';

export interface Ed25519Keypair {
	publicKey : string
	privateKey : string
};

export async function generateEd25519Keypair() : Promise<Ed25519Keypair> {
    const keypair = web3.Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    const privateKey = bs58.encode(keypair.secretKey);
    return {
        privateKey: privateKey,
        publicKey: publicKey
    };
}