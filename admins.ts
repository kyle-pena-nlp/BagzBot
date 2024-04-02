import { Env } from "./env";
import { strictParseInt, tryParseInt } from "./util";

export function isAnAdminUserID(userID : number, env : Env) {
	const adminUserIDs = env.ADMIN_TELEGRAM_USER_IDS
		.split(",")
		.map(uid => tryParseInt(uid))
		.filter(uid => uid != null);
	return adminUserIDs.includes(userID);
}

export function isTheSuperAdminUserID(userID : number, env : Env) : boolean {
    const superAdminUserID = strictParseInt(env.SUPER_ADMIN_USER_ID);
    return userID === superAdminUserID;
}

export function isAdminOrSuperAdmin(userID : number, env : Env) {
	return isAnAdminUserID(userID, env) || isTheSuperAdminUserID(userID, env);
}