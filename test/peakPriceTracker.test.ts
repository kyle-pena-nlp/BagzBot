import { DecimalizedAmount, dMult } from "../decimalized";
import { dZero } from "../decimalized/decimalized_amount";
import { PeakPricePositionTracker } from "../durable_objects/token_pair_position_tracker/trackers/peak_price_tracker";
import { Position, PositionStatus, PositionType } from "../positions";
import { TokenInfo, getVsTokenInfo } from "../tokens";

function updateTrackerAndCollectClosers(tracker : PeakPricePositionTracker, price : DecimalizedAmount) : Position[] {
    tracker.update(price);
    return tracker.collectPositionsToClose(price);
}

test("tracker_stores_position", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.add(pos.fillPrice, pos);
    expect(tracker.itemsByPeakPrice.size).toEqual(1);
});


test("tracker_does_not_trigger_small_price_drop", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.add(pos.fillPrice, pos);
    const triggeredPositions = updateTrackerAndCollectClosers(tracker, d(249,0));
    expect(triggeredPositions).toHaveLength(0);
});



test("tracker_does_not_trigger_price_same", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.add(pos.fillPrice, pos);
    const triggeredPositions = updateTrackerAndCollectClosers(tracker, d(250,0));
    expect(triggeredPositions).toHaveLength(0);
});

test("tracker_does_not_trigger_price_increase", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.add(pos.fillPrice, pos);
    const triggeredPositions = updateTrackerAndCollectClosers(tracker, d(260,0));
    expect(triggeredPositions).toHaveLength(0);
});


test("tracker_triggers_big_price_drop", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.add(pos.fillPrice, pos);
    const triggeredPositions = updateTrackerAndCollectClosers(tracker, d(225,0));
    expect(triggeredPositions).toHaveLength(1);
});

test("tracker_triggers_price_drop_after_peak", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());
    const pos = posWithPriceAndTrigger(d(250,0), triggerPct);
    tracker.add(pos.fillPrice, pos);
    const triggeredPositions1 = updateTrackerAndCollectClosers(tracker, d(300,0));
    expect(triggeredPositions1).toHaveLength(0);
    const triggeredPositions2 = updateTrackerAndCollectClosers(tracker, d(270,0));
    expect(triggeredPositions2).toHaveLength(1);
});

test("tracker_triggers_one_position_but_not_other", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());

    const pos1 = posWithPriceAndTrigger(d(280,0), triggerPct, "A");
    tracker.add(pos1.fillPrice, pos1);

    const pos2 = posWithPriceAndTrigger(d(300,0), triggerPct, "B");
    tracker.add(pos2.fillPrice, pos2);
    
    tracker.update(d(270,0));
    const triggeredPositions = tracker.collectPositionsToClose(d(270,0));
    expect(triggeredPositions).toHaveLength(1);
    expect(triggeredPositions[0].positionID).toEqual("B");
})

test("tracker_triggers_both_positions_after_peak_consolidation", () => {
    const triggerPct = 10;
    const tracker = new PeakPricePositionTracker(prefix());

    const pos1 = posWithPriceAndTrigger(d(280,0), triggerPct , "A");
    tracker.add(pos1.fillPrice, pos1);

    const pos2 = posWithPriceAndTrigger(d(290,0), triggerPct, "B");
    tracker.add(pos2.fillPrice, pos2);
    
    const triggeredPositions1 = updateTrackerAndCollectClosers(tracker, d(300,0));
    expect(triggeredPositions1).toHaveLength(0);

    const triggeredPositions2 = updateTrackerAndCollectClosers(tracker, d(270,0));
    expect(triggeredPositions2).toHaveLength(2);    
})


function prefix() {
    return "position";
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
        confirmed : true,
        txSignature : 'abcd',
        txSlot: 0,
        token: fakeToken(),
        vsToken: getVsTokenInfo('SOL'),
        vsTokenAmt : amt_bought_in_sol, // 2 SOL
        tokenAmt: dMult(initPrice, amt_bought_in_sol),
        fillPrice : initPrice,
        sellSlippagePercent: 2,
        triggerPercent: 5,
        retrySellIfSlippageExceeded: true,
        txBuyAttemptTimeMS: 0,
        txSellAttemptTimeMS: 0,
        fillPriceMS: 0,
        userAddress: { address: '' },
        txBuySignature: '',
        txSellSignature: '',
        sellAutoDoubleSlippage: false,
        sellConfirmed: false,
        buyLastValidBlockheight: 0,
        sellLastValidBlockheight: 0,
        buyConfirmed: true,
        netPNL : dZero(),
        otherSellFailureCount: 0
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