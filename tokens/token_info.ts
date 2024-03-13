import { PublicKey } from "@solana/web3.js"
import { Env } from "../env";

const SWAP_JUPITER_REFERRAL_PROGRAM = "REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3";

export interface StagedTokenInfo {
    address: string
    name : string
	symbol : string
    logoURI: string
    decimals : number
}

export interface TokenInfo extends StagedTokenInfo {
    feeAccount: string
};

export async function deriveFeeAccount(tokenAddress : string, env : Env) : Promise<PublicKey> {
    const referralAccountPubkey = new PublicKey(env.FEE_ACCOUNT_PUBLIC_KEY);
    const outputToken = new PublicKey(tokenAddress);
    const [feeAccount] = await PublicKey.findProgramAddressSync(
        [
          Buffer.from("referral_ata"),
          referralAccountPubkey.toBuffer(), // your referral account public key
          outputToken.toBuffer(), // the token mint
        ],
        new PublicKey(SWAP_JUPITER_REFERRAL_PROGRAM) // the Referral Program
      );
    return feeAccount;
}