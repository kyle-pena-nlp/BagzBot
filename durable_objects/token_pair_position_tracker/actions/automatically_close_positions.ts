import { Position } from "../../../positions/positions"


export interface AutomaticallyClosePositionRequest {
    positionID : string
};

export interface AutomaticallyClosePositionsRequest {
    positions : Position[]
};


// <-- UserDO
export interface AutomaticallyClosePositionsResponse {
}
