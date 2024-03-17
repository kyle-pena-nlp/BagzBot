export class Result<T> {

	success: boolean;
	ok: boolean;
	message?: string;
	value?: T;

	constructor(success : boolean, message? : string, value? : T) {
		this.success = success;
		this.ok = success;
		this.message = message;
		this.value = value;
	}	

	static success<T>(value : T) {
		return new Result<T>(true,undefined,value);
	}

	static failure<T>(message : string | undefined) {
		return new Result<T>(false,(message||'').toString(),undefined);
	}
}