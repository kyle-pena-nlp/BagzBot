import { PublicKey } from "@solana/web3.js";
import { Buffer } from "node:buffer";
import { UserAddress } from "../crypto/wallet";
import { Env } from "../env";
import { Structural } from "../util";

const SWAP_JUPITER_REFERRAL_PROGRAM = "REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3";
const SOLANA_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    

export interface StagedTokenInfo {
    readonly [ key : string ] : Structural
    address: string
    name : string
	symbol : string
    logoURI: string
    decimals : number
}

export interface TokenInfo extends StagedTokenInfo {
    readonly [ key : string ] : Structural
};

export async function deriveFeeAccount(tokenAddress : string, env : Env) : Promise<PublicKey> {
    const referralAccountPubkey = new PublicKey(env.FEE_ACCOUNT_PUBLIC_KEY);
    const outputToken = new PublicKey(tokenAddress);
    const [feeAccount] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("referral_ata"),
          referralAccountPubkey.toBuffer(), // your referral account public key
          outputToken.toBuffer(), // the token mint
        ],
        new PublicKey(SWAP_JUPITER_REFERRAL_PROGRAM) // the Referral Program
      );
    return feeAccount;
}

export function deriveTokenAccount(tokenAddress : string, userAddress : UserAddress) : PublicKey {
    const mint = new PublicKey(tokenAddress);
    const owner = new PublicKey(userAddress.address);
    const programId = new PublicKey(SOLANA_TOKEN_PROGRAM_ID);
    const associatedTokenProgramID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
    const [address] = PublicKey.findProgramAddressSync([owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],associatedTokenProgramID);
    return address;
}