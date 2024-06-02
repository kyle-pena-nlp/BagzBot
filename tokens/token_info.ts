import { PublicKey } from "@solana/web3.js";
import { Buffer } from "node:buffer";
import { UserAddress } from "../crypto";
import { Env } from "../env";
import { Structural } from "../util";

export const SWAP_JUPITER_REFERRAL_PROGRAM = "REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3";
export const SOLANA_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const SOLANA_TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    

export interface StagedTokenInfo {
    readonly [ key : string ] : Exclude<Structural,undefined>
    address: string
    name : string
	symbol : string
    logoURI: string
    decimals : number
    tokenType : 'token'|'token-2022'
}

export interface TokenInfo extends StagedTokenInfo {
    readonly [ key : string ] : Exclude<Structural,undefined>
}

export async function deriveFeeAccount(tokenAddress : string, env : Env) : Promise<PublicKey> {
    const referralAccountPubkey = new PublicKey(env.SECRET__FEE_ACCOUNT_PUBLIC_KEY);
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

export function deriveTokenAccount(tokenAddress : string, userAddress : UserAddress, type : 'token'|'token-2022') : PublicKey {
    const mint = new PublicKey(tokenAddress);
    const owner = new PublicKey(userAddress.address);
    const programIds = { 'token': SOLANA_TOKEN_PROGRAM_ID, 'token-2022': SOLANA_TOKEN_2022_PROGRAM_ID }
    const programId = new PublicKey(programIds[type]);
    const associatedTokenProgramID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
    const [address] = PublicKey.findProgramAddressSync([owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],associatedTokenProgramID);
    return address;
}