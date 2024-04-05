import { DecimalizedAmount, dAdd } from "../../../decimalized";
import { dZero } from "../../../decimalized/decimalized_amount";
import { Position, PositionStatus } from "../../../positions";
import { ClosedPositionsPNLSummary } from "../actions/get_closed_positions_and_pnl_summary";

export class ClosedPositionPNLSummarizer {
    netSOL : DecimalizedAmount = dZero();
    closedPositions : Position[] = [];
    constructor() {
    }
    update(position : Position) {
        if (position.status !== PositionStatus.Closed) {
            return;
        }
        // some legacy positions may not have recorded pnl.
        if (position.netPNL == null) {
            return;
        }
        // I don't think this can happen but just to safe...
        if (this.closedPositions.map(p => p.positionID).includes(position.positionID)) {
            return;
        }
        this.closedPositions.push(position);
        this.netSOL = dAdd(this.netSOL, position.netPNL);
    }
    getSummary() : ClosedPositionsPNLSummary {
        return { 
            netSOL: this.netSOL
        }
    }
    listContributingPositions() : Position[] {
        return this.closedPositions;
    }
}