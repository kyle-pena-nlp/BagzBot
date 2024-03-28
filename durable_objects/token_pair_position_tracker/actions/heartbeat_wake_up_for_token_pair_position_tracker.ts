export interface HeartbeatWakeupRequestForTokenPairPositionTracker {
    isHeartbeat: true
}

export function isHeartbeatRequest(body : any) {
    return ('isHeartbeat' in body) && body.isHeartbeat === true;
}