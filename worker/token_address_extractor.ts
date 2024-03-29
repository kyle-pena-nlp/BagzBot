import * as bs58 from "bs58";

export class TokenAddressExtractor {

    constructor() {
    }

    maybeExtractTokenAddress(message : string) : string|undefined {
        message = message.trim();
        if (this.isBase58Address(message)) {
            return message;
        }
        else if (this.isBirdeye(message)) {
            return this.extractFromBirdeye(message);
        }
        else if (this.isSolscan(message)) {
            return this.extractFromSolscan(message);
        }
        else if (this.isSolanaFM(message)) {
            return this.extractFromSolanaFM(message);
        }
        else  {
            return;
        }
    }

    private isSolanaFM(message : string) : boolean {
        const host = this.extractHost(message);
        return host != null && host.toLowerCase() === 'solana.fm';
    }

    private extractFromSolanaFM(message : string) : string|undefined {
        const url = new URL(message);
        const pathname = url.pathname;
        const pathParts = pathname.split('/').filter(part => part !== '');
        if (pathParts[0] === 'address' && pathParts[1] != null) {
            return pathParts[1];
        }
        else {
            return;
        }
    }

    private isSolscan(message: string) : boolean {
        const host = this.extractHost(message);
        return host != null && host.toLowerCase() === 'solscan.io';
    }

    private extractFromSolscan(message : string) : string|undefined {
        const url = new URL(message);
        const pathname = url.pathname;
        const pathParts = pathname.split('/').filter(part => part !== '');
        if (pathParts[0] === 'account' && pathParts[1] != null) {
            return pathParts[1];
        }
        else {
            return;
        }
    }

    private isBirdeye(message : string) : boolean {
        const host = this.extractHost(message);
        return host != null && host.toLowerCase() === 'birdeye.so';
    }

    private extractFromBirdeye(message : string) : string|undefined {
        const url = new URL(message);
        const pathname = url.pathname;
        const pathParts = pathname.split('/').filter(part => part !== '');
        if (pathParts[0] === 'token' && pathParts[1] != null) {
            return pathParts[1];
        }
        else {
            return;
        }
    }

    private isDexScreener(message : string) : boolean {
        const host = this.extractHost(message);
        return host != null && host.toLowerCase() === 'dexscreener.com';
    }

    private extractHost(message : string) : string|undefined {
        try {
            const url = new URL(message);
            return url.host;
        }
        catch(e) {
            return;
        } 
    }

    private isBase58Address(maybeAddress : string) : boolean {
        maybeAddress = maybeAddress.trim();
        try {
            bs58.decode(maybeAddress)
            const l = maybeAddress.length;
            return l >= 32 && l <= 44;
        }
        catch(e) {
            return false;
        }
    }
}