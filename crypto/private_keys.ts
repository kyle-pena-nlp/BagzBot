import { Buffer } from "node:buffer";
import { Env } from "../env";
import { logError } from "../logging";
import { Structural } from "../util";
import { bufferToString, decryptWithAESGCM256, encryptWithAESGCM256, get256BitHashBuffer, get96BitHashBuffer, stringToBuffer } from "./aes256";

export interface EncryptedPrivateKey { 
    [ key : string ] : Structural
    bytesAsHexstring : string
}

/* Note - I am deriving the nonce from the userID + environment + instance because:
    1. There is only ever one piece of information encrypted by *this method* per user (this key)
    2. UserIDs are unique and static, so they are as good as sequential
*/
export async function encryptPrivateKey(plaintext : string, userID : number, env : Env): Promise<EncryptedPrivateKey> {
    const plaintextBuffer = stringToBuffer(plaintext);
    const iv = await get96BitHashBuffer(getIVString(userID,env));
    const passphrase = await derive256BitPassphrase(userID, env); 
    const encryptedArrayBuffer = await encryptWithAESGCM256(plaintextBuffer, passphrase, iv);
    const encryptedBuffer = Buffer.from(encryptedArrayBuffer);
    const encryptedHexBytes = encryptedBuffer.toString('hex');
    const result =  {
        bytesAsHexstring: encryptedHexBytes
    };
    const checkResult = await decryptPrivateKey(result, userID, env);
    if (checkResult !== plaintext) {
        logError({ userID : userID }, "Round-trip encryption of private key did not produce original key.");
        throw new Error("Programmer error.");
    }
    return result;
}

function getIVString(userID : number, env : Env) {
    if (env.ENVIRONMENT === 'dev') {
        // for backwards compat with existing keys
        return userID.toString();
    }
    else {
        return `${userID.toString()}:${env.ENVIRONMENT}`;
    }
}

export async function decryptPrivateKey(encryptedPrivateKey : EncryptedPrivateKey, userID :  number, env : Env) : Promise<string> {
    const encryptedBytes = Buffer.from(encryptedPrivateKey.bytesAsHexstring, 'hex');
    const iv = await get96BitHashBuffer(getIVString(userID,env));
    const passphrase = await derive256BitPassphrase(userID, env);
    const plaintextArrayBuffer = await decryptWithAESGCM256(encryptedBytes, passphrase, iv);
    const plaintextBuffer = Buffer.from(plaintextArrayBuffer);
    const plaintextString = bufferToString(plaintextBuffer);
    return plaintextString;
}



async function derive256BitPassphrase(userID :  number, env: Env) : Promise<CryptoKey> {
    const hashBuffer = await get256BitHashBuffer(userID.toString() + env.SECRET__PK_AES_SALT);
    const key = await crypto.subtle.importKey(
        'raw', // format
        hashBuffer, // keyData
        { name: 'AES-GCM' }, // algorithm
        false, // extractable
        ['encrypt', 'decrypt'] // keyUsages
    );
    return key;
}
