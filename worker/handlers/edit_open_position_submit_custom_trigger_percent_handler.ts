import * as Menus from "../../menus";
import * as Util from "../../util";
import { BaseMenuCodeHandler } from "./base_menu_code_handler";
import { Env } from "../../env";
import { BaseMenu, MenuCode } from "../../menus";
import { ReplyQuestion, ReplyQuestionCode } from "../../reply_question";
import { CallbackHandlerParams } from "../model/callback_handler_params";
import { TGStatusMessage, TGMessageChannel } from "../../telegram";
import { logError, logDebug, logInfo } from "../../logging";
import { readSessionObj, storeSessionObj, storeSessionObjProperty } from "../../durable_objects/user/userDO_interop";

export class EditOpenPositionSubmitCustomTriggerPercentHandler extends BaseMenuCodeHandler<MenuCode.EditOpenPositionSubmitCustomTriggerPercent> {
    constructor(menuCode : MenuCode.EditOpenPositionSubmitCustomTriggerPercent) {
        super(menuCode);
    }
    async handleCallback(params : CallbackHandlerParams, context: FetchEvent, env: Env) : Promise<BaseMenu|ReplyQuestion|void> {
        const callbackData = params.callbackData;
        const messageID = params.messageID;
        const positionIDAndTriggerPercent = PositionIDAndTriggerPercent.gracefulParse(callbackData.menuArg||'');
        if (positionIDAndTriggerPercent == null) {
            return new Menus.MenuContinueMessage('Sorry - there was an unexpected problem', MenuCode.Main, env);
        }
        else if ('percent' in positionIDAndTriggerPercent &&  positionIDAndTriggerPercent.percent > 0 && positionIDAndTriggerPercent.percent < 100) {
            await editTriggerPercentOnOpenPositionFromUserDO(params.getTelegramUserID(), params.chatID, positionIDAndTriggerPercent.positionID, positionIDAndTriggerPercent.percent, env);
            return await this.makeOpenPositionMenu(params, positionIDAndTriggerPercent.positionID);
        }
        else {
            return new Menus.MenuContinueMessage('Sorry - that was an invalid percentage', MenuCode.ViewOpenPosition, env, 'HTML', positionIDAndTriggerPercent.positionID);
        }
    default:
        assertNever(callbackData.menuCode);
}
    }
    private sorryError(menuCode ?: MenuCode, menuArg ?: string) : MenuContinueMessage {
return new Menus.MenuContinueMessage(`We're sorry - an error has occurred`, menuCode || MenuCode.Main, env, 'HTML', menuArg);
    }
    private async makeOpenPositionMenu(params : CallbackHandlerParams, positionID : string) : Promise<BaseMenu> {
const positionAndMaybePNL = await getPositionFromUserDO(params.getTelegramUserID(), params.chatID, positionID, env);
if (positionAndMaybePNL == null) {
    return this.sorryError();
}
return new Menus.MenuViewOpenPosition({ data: positionAndMaybePNL }, env);
    }
    private async sendBetaFeedbackToSuperAdmin(feedback : string, myUserName : string, myUserID : number) : Promise<void> {
await sendMessageToUser(Util.strictParseInt(env.SUPER_ADMIN_USER_ID), myUserName, myUserID,feedback, env);
    }
    private async createMainMenu(info : CallbackHandlerParams | TelegramWebhookInfo, env : Env) : Promise<BaseMenu> {
const userData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
return new Menus.MenuMain({ ...userData, ...this.makeAdminInfo(info, env) }, env);
    }
    private makeAdminInfo(info : CallbackHandlerParams | TelegramWebhookInfo, env : Env) : AdminInfo {
return {
    isAdminOrSuperAdmin: info.isAdminOrSuperAdmin(env),
    isImpersonatingUser: info.isImpersonatingAUser(),
    impersonatedUserID: info.isImpersonatingAUser() ? info.getTelegramUserID() : undefined
};
    }
    private async handleMenuClose(chatID : number, messageID : number, env : Env) : Promise<Response> {
const result = await deleteTGMessage(messageID, chatID, env);
if (!result.success) {
    return makeFakeFailedRequestResponse(500, "Couldn't delete message");
}
else {
    return makeSuccessResponse();
}
    }
    private async getTrailingStopLossPositionVsTokenFromSession(telegramUserID : number, chatID : number, messageID : number, env : Env) : Promise<TokenSymbolAndAddress> {
const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
return {
    tokenSymbol: positionRequest.vsToken.symbol,
    tokenAddress: positionRequest.vsToken.address
};
    }
    private async getTrailingStopLossPositionQuantityAndVsTokenFromSession(telegramUserID : number, chatID : number, messageID : number, env: Env) : Promise<QuantityAndToken> {
const positionRequest = await readSessionObj<PositionRequest>(telegramUserID, chatID, messageID, POSITION_REQUEST_STORAGE_KEY, env);
return {
    thisTokenSymbol:  positionRequest.vsToken.symbol,
    thisTokenAddress: positionRequest.vsToken.address,
    quantity: positionRequest.vsTokenAmt
};
    }
    private async makeStopLossRequestEditorMenu(positionRequest : PositionRequest, maybeSOLBalance : DecimalizedAmount|null, env : Env) : Promise<BaseMenu> {
await this.refreshQuote(positionRequest, env);
return new Menus.MenuEditPositionRequest({ positionRequest, maybeSOLBalance }, env);
    }
    private async handleManuallyClosePosition(telegramUserID : number, chatID : number, positionID : string, env : Env) : Promise<Response> {
const result = await manuallyClosePosition(telegramUserID, chatID, positionID, env);
return makeSuccessResponse();
    }
    async handleCommand(telegramWebhookInfo : TelegramWebhookInfo) : Promise<Response> {
const command = telegramWebhookInfo.command!!;
const tgMessage = await sendMessageToTG(telegramWebhookInfo.chatID, 'One moment...', env);
if (!tgMessage.success) {
    return makeSuccessResponse();
}
const conversationMessageID = tgMessage.messageID;
const [commandTextResponse,menu,storeSessionObjectRequest] = await this.handleCommandInternal(command, telegramWebhookInfo, conversationMessageID, env);
const tgMessageInfo = await updateTGMessage(telegramWebhookInfo.chatID, conversationMessageID, commandTextResponse, env);
if (!tgMessageInfo.success) {
    return makeSuccessResponse();
}
if (storeSessionObjectRequest != null) {
    await storeSessionObj(telegramWebhookInfo.getTelegramUserID(), telegramWebhookInfo.chatID, conversationMessageID, storeSessionObjectRequest.obj, storeSessionObjectRequest.prefix, env);
}
if (menu != null) {
    await menu.sendToTG({ chatID : telegramWebhookInfo.chatID, messageID :conversationMessageID}, env);
}
return makeSuccessResponse();
    }
    async handleReplyToBot(info : TelegramWebhookInfo) : Promise<Response> {
const userAnswer = info.text||'';
// read the callback data tucked away about the reply question
const questionMessageID = info.messageID;
const replyQuestionData = await maybeReadSessionObj<ReplyQuestionData>(info.getTelegramUserID('real'), info.chatID, questionMessageID, "replyQuestion", env);
if (replyQuestionData == null) {
    return makeSuccessResponse();
}
// delete the question and reply messages from the chat (otherwise, it looks weird)
const userReplyMessageID = info.realMessageID;
if (userReplyMessageID) {
    await deleteTGMessage(userReplyMessageID, info.chatID, env);
}
await deleteTGMessage(questionMessageID, info.chatID, env);
// handle whatever special logic the reply code entails
const replyQuestionCode = replyQuestionData.replyQuestionCode;
switch(replyQuestionCode) {
    case ReplyQuestionCode.EnterBetaInviteCode:
        await this.handleEnterBetaInviteCode(info, userAnswer||'', env);
        break;
    default:
        break;
}
// If the reply question has callback data, delegate to the handleCallback method
if (replyQuestionHasNextSteps(replyQuestionData)) {
    const replyQuestionCallback = new CallbackHandlerParams(info, replyQuestionData);
    return await this.handleCallback(replyQuestionCallback);
}
return makeSuccessResponse();
    }
    async handleEnterBetaInviteCode(info: TelegramWebhookInfo, code : string, env : Env) {
code = code.trim().toUpperCase();
// operation is idempotent.  effect of operation is in .status of response
const claimInviteCodeResponse = await claimInviteCode({ userID : info.getTelegramUserID(), inviteCode: code }, env);
if (claimInviteCodeResponse.status === 'already-claimed-by-you') {
    await sendMessageToTG(info.chatID, `You have already claimed this invite code and are good to go!`, env);
}
else if (claimInviteCodeResponse.status === 'firsttime-claimed-by-you') {
    // greet the new user
    await this.sendUserWelcomeScreen(info, env);
}
else if (claimInviteCodeResponse.status === 'claimed-by-someone-else') {
    // tell user sorry, code is already claimed
    await sendMessageToTG(info.chatID, `Sorry ${info.getTelegramUserName()} - this invite code has already been claimed by someone else.`, env);
}
else if (claimInviteCodeResponse.status === 'code-does-not-exist') {
    // tell user sorry, that's not a real code
    await sendMessageToTG(info.chatID, `Sorry ${info.getTelegramUserName()} - '${code}' is not a known invite code.`, env);
    return makeSuccessResponse();
}
else if (claimInviteCodeResponse.status === 'you-already-claimed-different-code') {
    await sendMessageToTG(info.chatID, `You have already claimed a different invite code!`, env);
}
    }
    private async sendUserWelcomeScreen(telegramWebhookInfo : TelegramWebhookInfo, env : Env) {
await new WelcomeScreenPart1(undefined, env).sendToTG({ chatID : telegramWebhookInfo.chatID }, env);
    }
    private async handleCommandInternal(command : string, info : TelegramWebhookInfo, messageID : number, env : Env) : Promise<[string,BaseMenu?,{ obj : any, prefix : string }?]> {
switch(command) {
    case '/start':
        const userData = await getUserData(info.getTelegramUserID(), info.chatID, info.messageID, false, env);
        const mainMenuStart = await this.createMainMenu(info, env);
        return ["...", mainMenuStart];
    case '/menu':
        const menuMain = await this.createMainMenu(info, env);
        return ['...', menuMain];
    case '/welcome_screen':
        return ['...', new WelcomeScreenPart1(undefined, env)];
    case '/legal_agreement':
        return ['...', new LegalAgreement(undefined, env)];
    case '/faq':
        return ['...', new Menus.MenuFAQ({ userID : info.getTelegramUserID(), chatID : info.chatID }, env)];
    case '/list_positions':
        const positions = await listPositionsFromUserDO(info.getTelegramUserID(), info.chatID, env);
        return ['...', new Menus.MenuListPositions(positions, env)];
    case '/pnl_history':
        const closedPositionsAndPNLSummary = await getClosedPositionsAndPNLSummary(info.getTelegramUserID(), info.chatID, env);
        return ['...',new Menus.MenuPNLHistory({ closedPositions : closedPositionsAndPNLSummary.closedPositions, netPNL: closedPositionsAndPNLSummary.closedPositionsPNLSummary.netSOL }, env)];
    case '/new_position':
        const defaultPr = await getDefaultTrailingStopLoss(info.getTelegramUserID(), info.chatID, messageID, env);
        const prerequest = defaultPr.prerequest;
        let tokenInfo : TokenInfo|null|'failed' = await getTokenInfo(prerequest.tokenAddress, env).then(r => r.tokenInfo).catch(r => 'failed');
        if (tokenInfo === 'failed') {
            return ['...', new Menus.MenuOKClose(`Sorry - couldn't create a new position at this time`, env)];
        }
        else if (tokenInfo == null) {
            // retry with WEN if default / last used token fails.
            tokenInfo = await getTokenInfo(WEN_ADDRESS, env).then(r => r.tokenInfo);
        }
        if (tokenInfo == null || tokenInfo === 'failed') {
            // If even WEN fails... out of luck, dear user.
            return ['...', new Menus.MenuOKClose(`Sorry - couldn't create a new position at this time`, env)];
        }
        assertIs<TokenInfo,typeof tokenInfo>();
        const quote = await quoteBuy(prerequest, tokenInfo, env);
        // TODO: default back to WEN so new_position command isn't perma-broken
        // if getting the quote fails, early-out
        if (isGetQuoteFailure(quote)) {
            return ['...', new Menus.MenuOKClose(`Sorry - couldn't create a new position at this time`, env)];
        }
        // now that we have a quote and tokenInfo, convert the pre-request to a request
        const positionRequest = convertPreRequestToRequest(prerequest, quote, tokenInfo);
        const storeObjectRequest = {
            prefix: POSITION_REQUEST_STORAGE_KEY,
            obj: positionRequest
        };
        const maybeSOLBalance = await getUserWalletSOLBalance(positionRequest.userID, positionRequest.chatID, env);
        return ['...', new Menus.MenuEditPositionRequest({ positionRequest, maybeSOLBalance }, env), storeObjectRequest];
    default:
        throw new Error(`Unrecognized command: ${command}`);
}
    }
    private async refreshQuote(positionRequest : PositionRequest, env : Env) : Promise<boolean> {
const quote = await quoteBuy(positionRequest, positionRequest.token, env);
if (isGetQuoteFailure(quote)) {
    return false;
}
positionRequest.quote = quote;
return true;
    }
}
    }
}
