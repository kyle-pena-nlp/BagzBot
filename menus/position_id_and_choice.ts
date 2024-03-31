import { tryParseBoolean } from "../util";

export class PositionIDAndChoice {
    positionID : string
    choice : boolean
    constructor(positionID : string, choice : boolean) {
        this.positionID = positionID;
        this.choice = choice;
    }
    static parse(menuArg : string) {
        const tokens = menuArg.split("|");
        if (tokens.length !== 2) {
            return null;
        }
        const positionID = tokens[0];
        const booleanString = tokens[1];
        const maybeBoolean = tryParseBoolean(booleanString);
        if (maybeBoolean == null) {
            return null;
        } 
        return new PositionIDAndChoice(positionID,maybeBoolean);
    }
    asMenuArg() {
        return `${this.positionID}|${this.choice.toString()}`;
    }
}