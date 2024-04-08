
import { Env } from "./env";
import { TGStatusMessage, TelegramWebhookInfo, sendMessageToTG } from "./telegram";
import { assertNever, makeFakeFailedRequestResponse, makeSuccessResponse, strictParseBoolean } from "./util";
import { CallbackHandler as Handler } from "./worker/handler";

/* Durable Objects */
import { isAdminOrSuperAdmin } from "./admins";
import { getUserHasClaimedBetaInviteCode } from "./durable_objects/beta_invite_codes/beta_invite_code_interop";
import { BetaInviteCodesDO } from "./durable_objects/beta_invite_codes/beta_invite_codes_DO";
import { HeartbeatDO } from "./durable_objects/heartbeat/heartbeat_do";
import { PolledTokenPairListDO } from "./durable_objects/polled_token_pair_list/polled_token_pair_list_DO";
import { TokenPairPositionTrackerDO } from "./durable_objects/token_pair_position_tracker/token_pair_position_tracker_do";
import { getImpersonatedUserID, getLegalAgreementStatus, maybeReadSessionObj, unimpersonateUser } from "./durable_objects/user/userDO_interop";
import { UserDO } from "./durable_objects/user/user_DO";
import { logError } from "./logging";
import { MenuCode, logoHack } from "./menus";
import { ReplyQuestion, ReplyQuestionCode } from "./reply_question";
import { ReplyQuestionData } from "./reply_question/reply_question_data";
import { CallbackHandlerParams } from "./worker/model/callback_handler_params";

/* CF requires export of any imported durable objects */
export { BetaInviteCodesDO, HeartbeatDO, PolledTokenPairListDO, TokenPairPositionTrackerDO, UserDO };

/**
 * Worker
 */
export default {

	// Worker CRON job (invoked by CF infra)
	async scheduled(event : ScheduledEvent, env : Env, context : FetchEvent) {

		// no CRON if down for maintenance
		if (strictParseBoolean(env.DOWN_FOR_MAINTENANCE)) {
			return;
		}

		// we use the per-minute CRON job to handle cold-start / making sure token pairs are polling
		const handler = new Handler(context, env);
		if (event.cron === "* * * * *") {
			context.waitUntil(handler.handleMinuteCRONJob(env));
		}
		else if (event.cron === "*/30 * * * *" && strictParseBoolean(env.REBUILD_TOKENS_CRON_JOB)) {
			context.waitUntil(handler.handleRebuildTokensCRONJob(env));
		}
	},

	// Worker fetch method (this is what the TG webhook calls)
	async fetch(req : Request, env : Env, context : FetchEvent) {
		try {
			return await this._fetch(req, context, env);
		}
		catch(e : any) {
			// TG re-broadcasts any message it gets a failed status code from, so we avoid failed status codes			
			await this.logWebhookRequestFailure(req, e);
			return makeFakeFailedRequestResponse(500);
		}
	},

	async _fetch(req : Request, context : FetchEvent, env : Env) : Promise<Response> {

		// Let a series of handlers set the response. 
		// Setting the response means early out in chain-of-responsibility.
		let response : Response|null = null;

		// If the request doesn't contain the secret key in the header...
		//  (is probably not from TG, might be sniffing), respond with uninformative 403 
		response = this.handleSuspiciousRequest(req,env);
		if (response != null) {
			return response;
		}

		// Parse the webhook info. Early out if fails.
		const telegramWebhookInfo = await this.tryGetTelegramWebhookInfo(req,env);
		if (telegramWebhookInfo == null) {
			return makeFakeFailedRequestResponse(400);
		}

		// If down for maintenance, no requests go through. early out.
		response = await this.handleDownForMaintenance(telegramWebhookInfo,env);
		if (response != null) {
			return response;
		}

		// knows how to handle callbacks from the user.
		const callbackHandler = new Handler(context, env);		

		/*
			Please Note:
				The term 'impersonate' means: Begin User Support, not 'Identity Theft'.
				It's a technical term.
				It allows an admin to view a user's positions, etc (but not place/sell positions)
		*/

		// If unimpersonate, remove impersonation user ID from UserDO, and then proceed.
		await this.handleUnimpersonateUser(telegramWebhookInfo, env);

		// if impersonated, set impersonation on the webhook info
		await this.impersonateUserIfImpersonatingUser(telegramWebhookInfo,env);

		// process an user's entry of a beta code
		response = await this.handleBetaCodeUserEntryUserResponse(telegramWebhookInfo,callbackHandler,env);
		if (response != null) {
			return response;
		}

		// process a user's response to the legal agreement
		response = await this.handleLegalAgreementUserResponse(telegramWebhookInfo,callbackHandler,env);
		if (response != null) {
			return response;
		}

		// process a user's request to see the legal agreement. display user agreement to user if requested.
		response = await this.handleViewLegalAgreement(telegramWebhookInfo,callbackHandler,env);
		if (response != null) {
			return response;
		}

		// if the user needs a beta invite code and they don't have one, let them know and early out.
		response = await this.handleBetaInviteCodeGating(telegramWebhookInfo,context,env);
		if (response != null) {
			return response;
		}


		// if the user hasn't agreed to legal agreement, let them know and early out.
		response = await this.handleLegalAgreementGating(telegramWebhookInfo,context,env);
		if (response != null) {
			return response;
		}		

		// We are out of special-case world.  We can let the callback handler do the rest.

		// alias some things
		const messageType = telegramWebhookInfo.messageType;

		// user responds to a bot question
		if (messageType === 'replyToBot') {
			return await callbackHandler.handleReplyToBot(telegramWebhookInfo);
		}

		// User clicks a menu button
		if (messageType === 'callback') {
			return await callbackHandler.handleCallback(new CallbackHandlerParams(telegramWebhookInfo));
		}

		// User issues a TG command
		if (messageType === 'command') {
			return await callbackHandler.handleCommand(telegramWebhookInfo);
		}
		
		// User types a message to the bot
		if (messageType === 'message') {
			return await callbackHandler.handleMessage(telegramWebhookInfo);
		}
		
		// Never send anything but a 200 back to TG ---- otherwise telegram will keep trying to resend
		return makeSuccessResponse();
	},

	async tryGetTelegramWebhookInfo(req : Request, env: Env) : Promise<TelegramWebhookInfo|null> {
		const telegramRequestBody = await this.parseRequestBody(req,env).catch(e => {
			logError(`No JSON on request body - IP: ${this.ip_address_of(req)}`);
			return null;
		});	
		if (telegramRequestBody == null) {
			return null;
		}
		try {
			return new TelegramWebhookInfo(telegramRequestBody, env);
		}
		catch(e) {
			// I don't anticipate parsing errors, but maybe some weird kind of message gets sent from the user?
			logError(`Error parsing TG webhook`, e);
			return null;
		}
		
	},

	async handleBetaInviteCodeGating(info : TelegramWebhookInfo, context: FetchEvent, env : Env) : Promise<Response|null> {
		// enforce beta code gating (if enabled).

		// if beta code gating is off, no need.
		if (!strictParseBoolean(env.IS_BETA_CODE_GATED)) {
			return null;
		}

		// see if the user has claimed a beta code (or is exempt from needing one)
		const userHasClaimedBetaInviteCode = await getUserHasClaimedBetaInviteCode({ userID: info.getTelegramUserID() }, env);
		
		if (userHasClaimedBetaInviteCode.status === 'has-not') {
			const replyQuestion = new ReplyQuestion(`Hi ${info.getTelegramUserName()}, we are in BETA!  Please enter your invite code:`, 
				ReplyQuestionCode.EnterBetaInviteCode,
				context,
				{
					timeoutMS: 10000
				});
			await replyQuestion.sendReplyQuestionToTG(info.getTelegramUserID('real'), info.chatID, env);
			return makeSuccessResponse();
		}
		else if (userHasClaimedBetaInviteCode.status === 'has') {
			return null;
		}
		else {
			assertNever(userHasClaimedBetaInviteCode.status);
		}
	},

	async handleLegalAgreementGating(info : TelegramWebhookInfo, context: FetchEvent, env: Env) : Promise<Response|null> {
		
		const response = await getLegalAgreementStatus(info.getTelegramUserID('real'), info.chatID, env);
		
		if (response.status === 'agreed') {
			return null;
		}
		else if (response.status === 'has-not-responded' || response.status === 'refused') {
			const channel = TGStatusMessage.createAndSend(`Please agree to the <b>Terms Of Service</b> (see under 'Legal Agreement' under 'Menu').`,false,info.chatID,env);
			TGStatusMessage.queueWait(channel, 15000);
			TGStatusMessage.queueRemoval(channel)
			context.waitUntil(TGStatusMessage.finalize(channel));
			return makeSuccessResponse("User has not agreed to legal agreement");
		}
		else {
			assertNever(response.status);
		}
	},

	async handleBetaCodeUserEntryUserResponse(info : TelegramWebhookInfo, handler : Handler, env : Env) : Promise<Response|null> {
		
		// TG start command with beta code in a deep link
		if (this.isBetaCodeStartCommand(info)) {
			await handler.handleEnterBetaInviteCode(info, info.commandTokens?.[1]?.text||'', env);
			return makeSuccessResponse();
		}
		
		// see if we just sent a prompt to the user for the beta code
		const betaCodeQuestionData : ReplyQuestionData|null = await this.maybeGetBetaCodeQuestion(info, env);

		// If we did, process it.
		if (betaCodeQuestionData != null) {
			await handler.handleEnterBetaInviteCode(info, info.text||'', env);
			return makeSuccessResponse();
		}

		return null;
	},

	async handleDownForMaintenance(info : TelegramWebhookInfo, env : Env) {
		if (strictParseBoolean(env.DOWN_FOR_MAINTENANCE)) {
			await sendMessageToTG(info.chatID, `${logoHack()} Sorry, <b>${env.TELEGRAM_BOT_DISPLAY_NAME} - ${env.TELEGRAM_BOT_INSTANCE_DISPLAY_NAME}</b> is currently down for scheduled maintenance.`, env);
			return makeSuccessResponse();
		}
		return null;
	},

	async impersonateUserIfImpersonatingUser(info : TelegramWebhookInfo, env : Env) : Promise<void> {
		// do user impersonation, if an admin or *the* super admin is impersonating another user
		if (isAdminOrSuperAdmin(info.getTelegramUserID('real'), env)) {
			const impersonatedUserID = (await getImpersonatedUserID(info.getTelegramUserID('real'), info.chatID, env)).impersonatedUserID;
			if (impersonatedUserID !=  null) {
				const impersonationSuccess = info.impersonate(impersonatedUserID, env);
				if (impersonationSuccess === 'not-permitted') {
					logError(`Could not impersonate '${impersonatedUserID}'`, info);
				}
			}
		}
	},


    async parseRequestBody(req : Request, env : Env) : Promise<any> {
        const requestBody = await req.json();
        return requestBody;
    },

	handleSuspiciousRequest(req : Request, env : Env) : Response|null {
		const requestSecretToken = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
        const secretTokensMatch = (requestSecretToken === env.SECRET__TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN);
        if (!secretTokensMatch) {
            return new Response(null, {
				status: 403 // forbidden
			});;
        }
		return null;
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

    async logWebhookRequestFailure(req : Request, e : any) {
        const ip_address = this.ip_address_of(req);
		const maybeJSON = await req.json().catch(r => null);
        logError(`Failed webhook request: ${ip_address}`, e, maybeJSON);
    },

	async handleUnimpersonateUser(info : TelegramWebhookInfo, env : Env) : Promise<void> {
		if (info.callbackData && info.callbackData.menuCode === MenuCode.UnimpersonateUser) {
			await unimpersonateUser(info.getTelegramUserID('real'), info.chatID, env);
			info.unimpersonate(env);
		}
	},

	async alwaysAllowRequest(info : TelegramWebhookInfo, replyQuestionData : ReplyQuestionData|undefined) : Promise<boolean> {

		// if is an admin clicking 'unimpersonate'
		const unimpersonateCallback = info.callbackData && info.callbackData.menuCode === MenuCode.UnimpersonateUser;
		if (unimpersonateCallback) {
			return true;
		}

		if (this.isLegalAgreementTermsUserResponse(info)) {
			return true;
		}

		if (this.isBetaCodeQuestionResponse(info, replyQuestionData)) {
			return true;
		}

		return false;
	},

	async maybeGetBetaCodeQuestion(info : TelegramWebhookInfo, env : Env) : Promise<ReplyQuestionData|null> {
		if (info.messageType === 'replyToBot') {
			const replyQuestionData = await this.readReplyQuestionData(info, env);
			if (replyQuestionData == null) {
				return null;
			}
			else if (replyQuestionData.replyQuestionCode === ReplyQuestionCode.EnterBetaInviteCode) {
				return replyQuestionData;
			}
			else {
				return null;
			}
		}
		else {
			return null;
		}
	},

	async readReplyQuestionData(info : TelegramWebhookInfo, env : Env) {
		return await maybeReadSessionObj<ReplyQuestionData>(info.getTelegramUserID('real'), info.chatID, info.messageID, "replyQuestion", env);
	},

	isBetaCodeQuestionResponse(info : TelegramWebhookInfo, replyQuestionData : ReplyQuestionData|undefined) {

		if (this.isBetaCodeStartCommand(info)) {
			return true;
		}

		if (this.isBetaCodeQuestionReplyTo(info, replyQuestionData)) {
			return true;
		}
		
		return false;
	},

	isBetaCodeStartCommand(info : TelegramWebhookInfo) : boolean {
		// is start message with parameter (which would be an invite code)
		if (info.messageType === 'command' && info.command === '/start' && info.commandTokens?.[1] != null) {
			return true;
		}

		return false;
	},

	isBetaCodeQuestionReplyTo(info : TelegramWebhookInfo, replyQuestionData : ReplyQuestionData|undefined) : boolean {
		// if replying to question asking for beta code
		if (info.messageType === 'replyToBot') {
			
			// if there is no question being asked... do not proceed.
			if (replyQuestionData == null) {
				return false;
			}
			
			// if the question wasn't 'give me a beta code'... do not proceed.
			if (replyQuestionData.replyQuestionCode == ReplyQuestionCode.EnterBetaInviteCode) {
				return true;
			}
		}

		return false;
	},

	isLegalAgreementTermsUserResponse(info : TelegramWebhookInfo) : boolean {
		return this.isLegalAgreementMenuCode(info) || this.isViewLegalAgreementCommand(info);
	},

	isLegalAgreementMenuCode(info : TelegramWebhookInfo) : boolean {
		const LegalAgreementMenuCodes = [ MenuCode.LegalAgreement, MenuCode.LegalAgreementAgree, MenuCode.LegalAgreementRefuse ];
		if (info.callbackData && LegalAgreementMenuCodes.includes(info.callbackData.menuCode)) {
			return true;
		}
		else {
			return false;
		}
	},

	isViewLegalAgreementCommand(info : TelegramWebhookInfo) : boolean {
		if (info.messageType === 'command' && info.command === '/legal_agreement') {
			return true;
		}
		else {
			return false;
		}
	},

	async handleViewLegalAgreement(info : TelegramWebhookInfo, handler : Handler, env : Env) : Promise<Response|null> {
		if (this.isViewLegalAgreementCommand(info)) {
			return await handler.handleCommand(info);
		}
		else if (this.isViewLegalAgreementMenuCode(info)) {
			const params = new CallbackHandlerParams(info);
			return await handler.handleCallback(params);
		}
		else {
			return null;
		}
	},

	isViewLegalAgreementMenuCode(info : TelegramWebhookInfo) {
		return info.callbackData != null && info.callbackData.menuCode === MenuCode.LegalAgreement;
	},

	async handleLegalAgreementUserResponse(info : TelegramWebhookInfo, handler : Handler, env : Env) : Promise<Response|null> {
		if (this.isLegalAgreementMenuCode(info)) {
			const params = new CallbackHandlerParams(info);
			return await handler.handleCallback(params);
		}
		return null;
	},

	async enforceLegalAgreementGating(telegramWebhookInfo : TelegramWebhookInfo, handler : Handler, env : Env) : Promise<'proceed'|'do-not-proceed'> {
		// Of note: I am using real User ID for legal agreement gating.
		// That way, we can't circumvent legal agreement by impersonating.
		const response = await getLegalAgreementStatus(telegramWebhookInfo.getTelegramUserID('real'), telegramWebhookInfo.chatID, env);
		const legalAgreementStatus = response.status;
		
		if (legalAgreementStatus === 'agreed') {
			return 'proceed';
		}
		else if (legalAgreementStatus === 'refused') {
			return 'do-not-proceed';
		}
		else if (legalAgreementStatus === 'has-not-responded') {
			return 'do-not-proceed';
		}
		else {
			assertNever(legalAgreementStatus);
		}
	},

	async enforceBetaGating(info: TelegramWebhookInfo, handler: Handler, env : Env) : Promise<'proceed'|'beta-restricted'|'beta-code-entered'> {

		// if beta code gating is off, no need.
		if (!strictParseBoolean(env.IS_BETA_CODE_GATED)) {
			return 'proceed';
		}

		// see if the user has claimed a beta code (or is exempt from needing one)
		const userHasClaimedBetaInviteCode = await getUserHasClaimedBetaInviteCode({ userID: info.getTelegramUserID() }, env);
		
		if (userHasClaimedBetaInviteCode.status === 'has-not') {
			return 'beta-restricted';
		}
		else {
			return 'proceed';
		}
	}
};