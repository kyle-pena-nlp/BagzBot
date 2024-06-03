import { toNumber } from "../../../decimalized/decimalized_amount";
import { Position } from "../../../positions";
import { assertNever } from "../../../util";

export interface AutomaticTask {
    type : 'automatic-sell'|'confirm-buy'|'confirm-sell'
    positionID : string
}

export class AutomaticActions {

    automaticSells : string[];
    unconfirmedBuys : string[];
    unconfirmedSells : string[];
    vsTokenAmts : Map<string,number> = new Map<string,number>();
    
    constructor() {
        this.automaticSells = [];
        this.unconfirmedBuys = [];
        this.unconfirmedSells = [];
        this.vsTokenAmts = new Map<string,number>();
    }

    add(type : 'automatic-sell'|'unconfirmed-buy'|'unconfirmed-sell', position : Position) {
        const positionID = position.positionID;
        if (this.vsTokenAmts.has(positionID)) {
            return;
        }
        const vsTokenAmt = position.vsTokenAmt;
        this.vsTokenAmts.set(positionID,toNumber(vsTokenAmt));
        switch(type) {
            case 'automatic-sell':
                this.automaticSells.push(positionID);
                break;
            case 'unconfirmed-buy':
                this.unconfirmedBuys.push(positionID);
                break;
            case 'unconfirmed-sell':
                this.unconfirmedSells.push(positionID);
                break;
            default:
                assertNever(type);
        }
    }

    update(automaticActions : AutomaticActions) {
        this.automaticSells.push(...automaticActions.automaticSells);
        this.unconfirmedBuys.push(...automaticActions.unconfirmedBuys);
        this.unconfirmedSells.push(...automaticActions.unconfirmedSells);
        for (const [key,value] of automaticActions.vsTokenAmts) {
            this.vsTokenAmts.set(key,value);
        }
    }

    getTasks() : AutomaticTask[] {
        const tasks : AutomaticTask[] = [];
        for (const automaticSell of this.automaticSells) {
            tasks.push({ type: 'automatic-sell', positionID : automaticSell });
        }
        tasks.sort(t => -(this.vsTokenAmts.get(t.positionID)||0));
        const confirmTasks : AutomaticTask[] = [];
        for (const unconfirmedBuy of this.unconfirmedBuys) {
            confirmTasks.push({ type: 'confirm-buy', positionID: unconfirmedBuy });
        }
        for (const unconfirmedSell of this.unconfirmedSells) {
            confirmTasks.push({ type: 'confirm-sell', positionID: unconfirmedSell })
        }
        confirmTasks.sort(t => -(this.vsTokenAmts.get(t.positionID)||0));
        tasks.push(...confirmTasks);
        return tasks;
    }
}