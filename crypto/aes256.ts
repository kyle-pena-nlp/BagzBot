import { Buffer } from "node:buffer";

const AES256GCMALGO = 'AES-GCM';

export async function encryptWithAESGCM256(text : Buffer, 
    passphrase : CryptoKey, 
    iv : ArrayBuffer) : Promise<ArrayBuffer> {
    const params : AesGcmParams = makeAESGCM256Params(iv);
    const result = await crypto.subtle.encrypt(params, passphrase, text);
    return result;
}

export async function decryptWithAESGCM256(text : Buffer, 
    passphrase : CryptoKey, 
    iv : ArrayBuffer) : Promise<ArrayBuffer> {
    const params : AesGcmParams = makeAESGCM256Params(iv);
    const result = await crypto.subtle.decrypt(params, passphrase, text);
    return result;
}

export async function get256BitHashBuffer(s : string) : Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(s);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    return hashBuffer;
}

export async function get96BitHashBuffer(s : string) : Promise<ArrayBuffer> {
    const bits256 = await get256BitHashBuffer(s);
    const bits96 = bits256.slice(0, 96 / 8); // 12 byte nonce
    return bits96;
}



function makeAESGCM256Params(iv : ArrayBuffer) : AesGcmParams {
    return {
        name : AES256GCMALGO,
        iv : iv
    };
}


export function stringToBuffer(s : string) : Buffer {
    const byteArray = (new TextEncoder()).encode(s);
    const buffer = Buffer.from(byteArray);
    return buffer;
}

export function bufferToString(b : Buffer) : string {
    const utf8Decoder = new TextDecoder('utf-8');
    const s = utf8Decoder.decode(b);
    return s;
}