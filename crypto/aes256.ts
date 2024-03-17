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

/* Encode the string as bytes and pad it so the last byte is the number of bytes to trim off */
function stringToPKCS7PaddedBuffer(s : string) : Buffer {
    const b = stringToBuffer(s);
    return addPKCS7Padding(b);
}

/*Decode the string from bytes, and trim off the number of bytes indicated by the last byte */
function stringFromPKCS7PaddedBuffer(b : Buffer) : string {
    const unpaddedBuffer = removePKCS7Padding(b);
    return bufferToString(unpaddedBuffer);
}

function makeAESGCM256Params(iv : ArrayBuffer) : AesGcmParams {
    return {
        name : AES256GCMALGO,
        iv : iv
    };
}

function addPKCS7Padding(b : Buffer) : Buffer {
    const blockSize = 16; // AES-256 block size is ALWAYS 16 bytes
    const byteView = new Uint8Array(b);
    // gives 16 when byteView.length is divisible by 16
    // (which means an entire block of 16 is included.)
    const paddingSize = blockSize - (byteView.length % blockSize); 
    const paddedBuffer = new ArrayBuffer(byteView.length + paddingSize);
    const paddedView = new Uint8Array(paddedBuffer);
  
    // Copy original buffer
    paddedView.set(byteView);
  
    // Add padding bytes
    for (let i = byteView.length; i < paddedView.length; i++) {
      paddedView[i] = paddingSize;
    }
  
    return Buffer.from(paddedBuffer);
}

function removePKCS7Padding(b : Buffer) : Buffer {
    const byteView = new Uint8Array(b);
    const paddingSize = byteView[byteView.length - 1]; // Last byte value is the padding size
  
    // Validate padding
    const start = byteView.length - paddingSize;
    for (let i = start; i < byteView.length; i++) {
      if (byteView[i] !== paddingSize) {
        throw new Error('Invalid padding');
      }
    }
  
    const unpaddedBuffer = b.slice(0, byteView.length - paddingSize);
    return unpaddedBuffer;
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