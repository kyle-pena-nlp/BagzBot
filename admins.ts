import { EnvironmentVariables } from "./env";
import { strictParseBoolean, strictParseInt, tryParseInt } from "./util";

export function isAdminOrSuperAdmin(userID : number, env : EnvironmentVariables) {
	if (strictParseBoolean(env.TEST_NO_ADMINS_MODE)) {
		return false;
	}
	return isAnAdminUserID(userID, env) || isTheSuperAdminUserID(userID, env);
}

export function isTheSuperAdminUserID(userID : number, env : EnvironmentVariables) : boolean {
	if (strictParseBoolean(env.TEST_NO_ADMINS_MODE)) {
		return false;
	}
    const superAdminUserID = strictParseInt(env.SUPER_ADMIN_USER_ID);
    return userID === superAdminUserID;
}

// deliberately not exported to avoid confusion.
function isAnAdminUserID(userID : number, env : EnvironmentVariables) {
	if (strictParseBoolean(env.TEST_NO_ADMINS_MODE)) {
		return false;
	}
	const adminUserIDs = env.ADMIN_TELEGRAM_USER_IDS
		.split(",")
		.map(uid => tryParseInt(uid))
		.filter(uid => uid != null);
	return adminUserIDs.includes(userID);
}