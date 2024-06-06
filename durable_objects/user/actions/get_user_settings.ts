import { UserSettings } from "../model/user_settings";
import { BaseUserDORequest } from "./base_user_do_request";

export interface GetUserSettingsRequest extends BaseUserDORequest {

}

export interface GetUserSettingsResponse {
    userSettings : UserSettings
}