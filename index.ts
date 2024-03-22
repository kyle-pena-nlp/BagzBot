
import { Env } from "./env";
import { TelegramWebhookInfo } from "./telegram";
import { Result, makeFakeFailedRequestResponse, makeSuccessResponse, strictParseBoolean } from "./util";
import { Worker as Handler } from "./worker/handler";

/* Durable Objects */
import { getUserHasClaimedBetaInviteCode } from "./durable_objects/beta_invite_codes/beta_invite_code_interop";
import { BetaInviteCodesDO } from "./durable_objects/beta_invite_codes/beta_invite_codes_DO";
import { PolledTokenPairListDO } from "./durable_objects/polled_token_pair_list/polled_token_pair_list_DO";
import { TokenPairPositionTrackerDO } from "./durable_objects/token_pair_position_tracker/token_pair_position_tracker_DO";
import { maybeReadSessionObj } from "./durable_objects/user/userDO_interop";
import { UserDO } from "./durable_objects/user/user_DO";
import { MenuCode } from "./menus";
import { ReplyQuestion, ReplyQuestionCode } from "./reply_question";
import { SessionReplyQuestion } from "./reply_question/session_reply_question";

/* Export of imported DO's (required by wrangler) */
export { BetaInviteCodesDO, PolledTokenPairListDO, TokenPairPositionTrackerDO, UserDO };

enum ERRORS {
    UNHANDLED_EXCEPTION = 500,
   MISMATCHED_SECRET_TOKEN = 1000,
   COULDNT_PARSE_REQUEST_BODY_JSON = 1500,
   NO_RESPONSE = 2000,
   NOT_A_PRIVATE_CHAT = 3000
}

// TODO: on cold-start, wake up all the position Trackers (either directly or indirectly)

/**
 * Worker
 */
export default {

	async fetch(req : Request, env : Env) {
		try {
			const response = await this._fetch(req, env);
			if (!response) {
				this.logWebhookRequestFailure(req, ERRORS.NO_RESPONSE, {});
				return makeFakeFailedRequestResponse(500);
			}
			return response;
		}
		catch(e : any) {
			this.logWebhookRequestFailure(req, ERRORS.UNHANDLED_EXCEPTION, { "e": e.toString() });
			return makeFakeFailedRequestResponse(500); // 500 is stored in statusText, status is still 200
		}
	},

	async _fetch(req : Request, env : Env) : Promise<Response> {

		// First, validate that this req is coming from the telegram bot's webhook by checking secret key.
		const webhookRequestValidation = this.validateFetchRequest(req,env);
		
		if (!webhookRequestValidation.ok) {
			this.logWebhookRequestFailure(req,webhookRequestValidation.message, {});
			return this.makeResponseToSuspiciousWebhookRequest();
		}

		// Parse JSON from request
		let telegramRequestBody = null;
		try {
			telegramRequestBody = await this.parseRequestBody(req,env);
		}
		catch(e) {
			this.logWebhookRequestFailure(req, ERRORS.COULDNT_PARSE_REQUEST_BODY_JSON, {});
			return makeFakeFailedRequestResponse(400);
		}

		// get some important info from the telegram request
		const telegramWebhookInfo = new TelegramWebhookInfo(telegramRequestBody, env);
		const userID = telegramWebhookInfo.telegramUserID;
		const chatID = telegramWebhookInfo.chatID;
		const messageID = telegramWebhookInfo.messageID;
		const messageType = telegramRequestBody.messageType;

		// make the handler
		const handler = new Handler();

		// if beta invite code gating is on
		if (strictParseBoolean(env.IS_BETA_CODE_GATED)) {
			// see if the user has claimed a beta code
			const userHasClaimedBetaInviteCode = await getUserHasClaimedBetaInviteCode({ userID: telegramWebhookInfo.telegramUserID }, env);
			// if they have not, and this incoming message isn't a response to a bot question
			if (userHasClaimedBetaInviteCode.status === 'has-not' && messageType !== 'replyToBot') {
				// ignore the message and tell the user they need a code
				const replyQuestion = new ReplyQuestion(`We are in BETA!  Please enter your invite code:`, ReplyQuestionCode.EnterBetaInviteCode, MenuCode.Main);
				replyQuestion.sendReplyQuestion(userID, chatID, messageID, env);
				return makeSuccessResponse();
			}
			// otherwise, if they don't have a code, but they are responding to a bot question
			else if (userHasClaimedBetaInviteCode.status === 'has-not' && messageType === 'replyToBot') {
				// fetch the stored question being asked
				const replyQuestion = await maybeReadSessionObj<SessionReplyQuestion>(userID, messageID, "replyQuestion", env);
				// if the bot wasn't asking a question, ignore the reply
				if (replyQuestion == null) {
					return makeSuccessResponse();
				}
				// if the bot wasn't asking for a beta invite code, ignore the reply
				if (replyQuestion.replyQuestionCode != ReplyQuestionCode.EnterBetaInviteCode) {
					return makeSuccessResponse();
				}
				// otherwise, process the invite code
				await handler.handleEnterBetaInviteCode(telegramWebhookInfo, env);
				return makeSuccessResponse();
			}
		}

		// handle reply-tos
		if (messageType === 'replyToBot') {
			return await handler.handleReplyToBot(telegramRequestBody, env);
		}

		// User clicks a menu button
		if (messageType === 'callback') {
			return await handler.handleCallbackQuery(telegramWebhookInfo, env);
		}

		// User issues a command
		if (messageType === 'command') {
			return await handler.handleCommand(telegramWebhookInfo, env);
		}
		
		// User types a message
		if (messageType === 'message') {
			return await handler.handleMessage(telegramWebhookInfo, env);
		}
		
		// Never send anything but a 200 back to TG ---- otherwise telegram will keep trying to resend
		return makeSuccessResponse();
	},


    async parseRequestBody(req : Request, env : Env) : Promise<any> {
        const requestBody = await req.json();
        return requestBody;
    },

    validateFetchRequest(req : Request, env : Env) : Result<boolean> {
        const requestSecretToken = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
        const secretTokensMatch = (requestSecretToken === env.TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN);
        if (!secretTokensMatch) {
            return Result.failure(ERRORS.MISMATCHED_SECRET_TOKEN.toString());
        }
        return Result.success(true);
    },

    makeResponseToSuspiciousWebhookRequest() : Response {
        // 403, forbidden
        const response = new Response(null, {
            status: 403
        });
        return response;
    },

	ip_address_of(req : Request) : string {
		const ip = req.headers.get('cf-connecting-ip');
		const forwarded_ip = req.headers.get('x-forwarded-for');
		return `${ip}->${forwarded_ip}`;
	},

	logFailedParseChatInfoFromWebhookRequest(req : Request, parseChatInfoFailureReason : string) {
		const ip_address = this.ip_address_of(req);
		console.log(`${ip_address} :: ${parseChatInfoFailureReason}`);
	},

	makeResponseToChatInfoParseFailure() : Response {
		// 400, bad request
		const response = new Response(null, {
			status: 200, // Annoyingly, bot server will retry requests indefinetely if it gets response out of range of 200-299
			statusText: "400"
		});
		return response;
	},

    logWebhookRequestFailure(req : Request, error_code : ERRORS | string | undefined, addl_info_obj : any) {
        const ip_address = this.ip_address_of(req);
        const addl_info = JSON.stringify(addl_info_obj || {}, null, 0);
        const error_code_string = (error_code || '').toString();
        console.log(`${ip_address} :: ${error_code_string} :: ${addl_info}`);
    }
};