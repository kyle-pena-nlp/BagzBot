export interface AdminGetInfoRequest {
    isAdminGetInfo : true
}

export function isAdminGetInfoRequest(obj : any) : obj is AdminGetInfoRequest {
    return obj != null && 'isAdminGetInfo' in obj && obj.isAdminGetInfo === true;
}