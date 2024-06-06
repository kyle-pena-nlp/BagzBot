import { MakeAllPropsOptional } from "../../../util";
import { UserSettings } from "../model/user_settings";
import { BaseUserDORequest } from "./base_user_do_request";

export interface SetUserSettingsRequest extends BaseUserDORequest {
    changes : MakeAllPropsOptional<UserSettings>
}

export interface SetUserSettingsResponse {
    userSettings : UserSettings
}