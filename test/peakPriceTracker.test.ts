import { DurableObjectStorage } from "@cloudflare/workers-types";
import { DecimalizedAmount, dMult } from "../decimalized";
import { PeakPricePositionTracker } from "../durable_objects/token_pair_position_tracker/trackers/peak_price_tracker";
import { Position, PositionStatus, PositionType } from "../positions";
import { TokenInfo, getVsTokenInfo } from "../tokens";
import { FakeDurableObjectStorage } from "./fakeStorage";

test("tracker_stores_position", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.push(pos.fillPrice, pos);
    expect(tracker.itemsByPeakPrice.size).toEqual(1);
});


test("tracker_does_not_trigger_small_price_drop", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.push(pos.fillPrice, pos);
    const triggeredPositions = tracker.update(d(249,0));
    expect(triggeredPositions).toHaveLength(0);
});

test("tracker_does_not_trigger_price_same", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.push(pos.fillPrice, pos);
    const triggeredPositions = tracker.update(d(250,0));
    expect(triggeredPositions).toHaveLength(0);
});

test("tracker_does_not_trigger_price_increase", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.push(pos.fillPrice, pos);
    const triggeredPositions = tracker.update(d(260,0));
    expect(triggeredPositions).toHaveLength(0);
});


test("tracker_triggers_big_price_drop", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.push(pos.fillPrice, pos);
    const triggeredPositions = tracker.update(d(225,0));
    expect(triggeredPositions).toHaveLength(1);
});

test("tracker_triggers_price_drop_after_peak", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.push(pos.fillPrice, pos);
    const triggeredPositions1 = tracker.update(d(300,0));
    expect(triggeredPositions1).toHaveLength(0);
    const triggeredPositions2 = tracker.update(d(270,0));
    expect(triggeredPositions2).toHaveLength(1);
});

test("tracker_triggers_one_position_but_not_other", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());

    const pos1 = posWithPriceAndTrigger(d(280,0), triggerPct, "A");
    tracker.push(pos1.fillPrice, pos1);

    const pos2 = posWithPriceAndTrigger(d(300,0), triggerPct, "B");
    tracker.push(pos2.fillPrice, pos2);
    
    const triggeredPositions = tracker.update(d(270,0));
    expect(triggeredPositions).toHaveLength(1);
    expect(triggeredPositions[0].positionID).toEqual("B");
})

test("tracker_triggers_both_positions_after_peak_consolidation", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());

    const pos1 = posWithPriceAndTrigger(d(280,0), triggerPct);
    tracker.push(pos1.fillPrice, pos1);

    const pos2 = posWithPriceAndTrigger(d(290,0), triggerPct);
    tracker.push(pos2.fillPrice, pos2);
    
    const triggeredPositions1 = tracker.update(d(300,0));
    expect(triggeredPositions1).toHaveLength(0);

    const triggeredPositions2 = tracker.update(d(270,0));
    expect(triggeredPositions2).toHaveLength(2);    
})


test("storage_roundtrip_preserves_state", async () => {
    
    const fakeStorage = new FakeDurableObjectStorage();

    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos1 = posWithPriceAndTrigger(d(280,0), triggerPct);
    tracker.push(pos1.fillPrice, pos1);

    const pos2 = posWithPriceAndTrigger(d(290,0), triggerPct);
    tracker.push(pos2.fillPrice, pos2);

    await tracker.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    
    const entries = fakeStorage.list();
    const newTracker = new PeakPricePositionTracker(prefix());
    newTracker.initialize(entries);

    expect(newTracker).toEqual(tracker);
});

test("storage_only_dumps_deltas", async () => {
    
    const fakeStorage = new FakeDurableObjectStorage();

    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos1 = posWithPriceAndTrigger(d(280,0), triggerPct, "A");
    tracker.push(pos1.fillPrice, pos1);

    await tracker.flushToStorage(fakeStorage as unknown as DurableObjectStorage);

    expect([...Object.values(fakeStorage.puts)]).toEqual([pos1]);

    const pos2 = posWithPriceAndTrigger(d(290,0), triggerPct, "B");
    tracker.push(pos2.fillPrice, pos2);
    tracker.removePosition("A");

    await tracker.flushToStorage(fakeStorage as unknown as DurableObjectStorage);

    expect(fakeStorage.deletes).toEqual(["A"]);
    expect([...Object.values(fakeStorage.puts)]).toEqual([pos2]);
});

function prefix() {
    return ".";
}

function posWithPriceAndTrigger(initPrice : DecimalizedAmount, triggerPct : number, id : string = "ID") {
    const pos = posWithPrice(initPrice);
    pos.triggerPercent = triggerPct;
    pos.positionID = id;
    return pos;
}

function posWithPrice(initPrice : DecimalizedAmount) : Position {
    const amt_bought_in_sol = d(2,0);
    return {
        positionID: 'ID',
        userID : 0,
        chatID : 0,
        messageID: 0,
        type: PositionType.LongTrailingStopLoss,
        status: PositionStatus.Open,
        token: fakeToken(),
        vsToken: getVsTokenInfo('SOL'),
        vsTokenAmt : amt_bought_in_sol, // 2 SOL
        tokenAmt: dMult(initPrice, amt_bought_in_sol),
        fillPrice : initPrice,
        sellSlippagePercent: 2,
        triggerPercent: 5,
        retrySellIfSlippageExceeded: true
    }
}

function fakeToken() : TokenInfo {
    return {
        address: 'goof-address',
        name: 'goofies',
        symbol: 'GOOF',
        logoURI: 'schema://goofy-picture.png',
        decimals: 6
    };
}

function d(s : string|number, d : number) : DecimalizedAmount {
    return {
        tokenAmount : s.toString(),
        decimals : d
    }
}