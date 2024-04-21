import { CallbackButton } from "../telegram";
import { tryParseFloat } from "../util";
import { CallbackData } from "./callback_data";
import { Menu, MenuCapabilities } from "./menu";
import { MenuCode } from "./menu_code";

export class PositionIDAndTriggerPercent {
    positionID : string
    percent : number
    constructor(positionID : string, percent : number) {
        this.positionID = positionID;
        this.percent = percent;
    }
    toCallbackData() : string {
        return `${this.positionID}|${this.percent.toFixed(4)}`;
    }
    static parse(menuArg : string) {
        menuArg = menuArg.trim();
        if (menuArg == '') {
            return null;
        }
        const tokens = menuArg.split("|");
        if (tokens.length !== 2) {
            return null;
        }
        const [positionID,numAsString] = tokens;
        const percent = tryParseFloat(numAsString);
        if (percent == null) {
            return null;
        }
        return new PositionIDAndTriggerPercent(positionID,percent);
    }
    static gracefulParse(menuArg : string) : PositionIDAndTriggerPercent|{ positionID : string }|null {
        const result = PositionIDAndTriggerPercent.parse(menuArg);
        if (result != null) {
            return result;
        }
        const tokens = menuArg.split("|");
        return { positionID : tokens[0] };
    }
}

export class MenuEditOpenPositionTriggerPercent extends Menu<string> implements MenuCapabilities {
    renderText(): string {
        return "Edit the position's Trigger Percent";
    }
    renderOptions(): CallbackButton[][] {
        const positionID = this.menuData;
        const options = this.emptyMenu();
        const submitValueCode = MenuCode.SubmitOpenPositionTriggerPct;
        const percents = [1.0,5.0,10.0];
        for (const percent of percents) {
            this.insertButtonSameLine(options, percent.toFixed(1), new CallbackData(submitValueCode, new PositionIDAndTriggerPercent(positionID,percent).toCallbackData()));
        }
        this.insertButtonSameLine(options, "X%", new CallbackData(MenuCode.EditOpenPositionCustomTriggerPercent, positionID));
        this.insertButtonNextLine(options, ":back: Back", new CallbackData(MenuCode.ViewOpenPosition, positionID));
        return options;
    }
}