import { PublicKey } from "@solana/web3.js"
import { Env } from "../env";
import { Structural } from "../util/structural";
import { Buffer } from "node:buffer";

const SWAP_JUPITER_REFERRAL_PROGRAM = "REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3";

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