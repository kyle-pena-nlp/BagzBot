export const ERRORS = Object.freeze({
	UNHANDLED_EXCEPTION:     "UNHANDLED_EXCEPTION",
	MISMATCHED_SECRET_TOKEN: "MISMATCHED_SECRET_TOKEN",
	NO_RESPONSE: "NO_RESPONSE",
	NOT_A_PRIVATE_CHAT: "NOT_A_PRIVATE_CHAT"
});

export const ERROR_NOS = Object.freeze({
	UNHANDLED_EXCEPTION: 500,
	MISMATCHED_SECRET_TOKEN: 1000,
	NO_RESPONSE: 2000,
	NOT_A_PRIVATE_CHAT : 3000
});

export class Result {
	constructor(success,message,value) {
		this.success = success;
		this.ok = success;
		this.message = message;
		this.value = value;
	}	

	static success(value) {
		return new Result(true,null,value);
	}

	static failure(message) {
		return new Result(false,message,null);
	}
}
