import { isAdminOrSuperAdmin, isTheSuperAdminUserID } from "../../admins";
import { Env } from "../../env";
import { CallbackData } from "../../menus/callback_data";
import { ReplyQuestionWithNextSteps } from "../../reply_question/reply_question_data";
import { TelegramWebhookInfo } from "../../telegram";

export class CallbackHandlerParams {

    private _impersonatedUserID : number
    private _realUserID : number
    private _telegramUserName : string
    chatID : number
    messageID : number
    text : string|null 	

    callbackData : CallbackData   

    constructor(info : TelegramWebhookInfo, replyQuestion ?: ReplyQuestionWithNextSteps) {
        this._impersonatedUserID = info.getTelegramUserID();
        this._realUserID = info.getTelegramUserID('real');
        this._telegramUserName = info.getTelegramUserName('real');
        this.chatID = info.chatID;
        this.messageID = info.messageID;
        this.text = info.text;
        this.callbackData = info.callbackData!!;
		if (replyQuestion != null) {
			this.messageID = replyQuestion.linkedMessageID;
			const replyQuestionMenuArg = replyQuestion.menuArg != null ? `${replyQuestion.menuArg||''}|${this.text||''}` : this.text||''
			this.callbackData = new CallbackData(replyQuestion.nextMenuCode, replyQuestionMenuArg);
		}
    }

    // TODO: dedup this implementation shared with TelegramWebhookInfo

	getTelegramUserID(kind : 'impersonated'|'real' = 'impersonated') : number {
		if (kind === 'real') {
			return this._realUserID;
		}
		else {
			// this value is almost always the same as _realUserID
			// the exception would be when an admin is impersonating another user
			return this._impersonatedUserID;
		}
	}

	getTelegramUserName(kind : 'real'|'impersonated' = 'impersonated') : string {
		if (kind === 'real') {
			return this._telegramUserName;
		}
		else if (this._realUserID !== this._impersonatedUserID) {
			return `[IMPERSONATING ${this._impersonatedUserID}]`;
		}
		else {
			return this._telegramUserName;
		}
	}

	isAdminOrSuperAdmin(env : Env) {
		return isAdminOrSuperAdmin(this._realUserID, env);
	}

	isImpersonatingAUser() {
		return this._realUserID !== this._impersonatedUserID;
	}	

	impersonate(userToImpersonateID : number, env : Env) : 'now-impersonating-user'|'not-permitted' {
		if (!isAdminOrSuperAdmin(this._realUserID, env)) {
			return 'not-permitted';
		}
		const impersonatingAnAdmin = isAdminOrSuperAdmin(userToImpersonateID, env);
		if (impersonatingAnAdmin && !isTheSuperAdminUserID(this._realUserID, env)) {
			return 'not-permitted';
		}
		this._impersonatedUserID = userToImpersonateID;
		return 'now-impersonating-user';
	}

	unimpersonate(env : Env) {
		this._impersonatedUserID = this._realUserID;
	}	
}