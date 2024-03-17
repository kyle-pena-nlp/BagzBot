import { Position } from "../../../positions/position";


export interface AutomaticallyClosePositionRequest {
    positionID : string
};

export interface AutomaticallyClosePositionsRequest {
    positions : Position[]
};


// <-- UserDO
export interface AutomaticallyClosePositionsResponse {
}
