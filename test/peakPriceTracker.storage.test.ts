import { DurableObjectStorage } from "@cloudflare/workers-types";
import { DecimalizedAmount, dMult } from "../decimalized";
import { PeakPricePositionTracker } from "../durable_objects/token_pair_position_tracker/trackers/peak_price_tracker";
import { Position, PositionStatus, PositionType } from "../positions";
import { TokenInfo, getVsTokenInfo } from "../tokens";
import { FakeDurableObjectStorage } from "./fakeStorage";

function triggerPct() : number {
    return 10;
}

test("storage_roundtrip_preserves_state", async () => {
    
    const fakeStorage = new FakeDurableObjectStorage();

    const tracker = new PeakPricePositionTracker(prefix());
    const pos1 = pos(d(280,0), "A");
    tracker.add(pos1.fillPrice, pos1);

    const pos2 = pos(d(290,0), "B");
    tracker.add(pos2.fillPrice, pos2);

    await tracker.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
    
    const entries = fakeStorage.list();
    const newTracker = new PeakPricePositionTracker(prefix());
    newTracker.initialize(entries);

    expect(newTracker).toEqual(tracker);

});

test("storage_only_dumps_deltas", async () => {
    
    const fakeStorage = new FakeDurableObjectStorage();

    const tracker = new PeakPricePositionTracker(prefix());
    const pos1 = pos(d(280,0), "A");
    tracker.add(pos1.fillPrice, pos1);

    await tracker.flushToStorage(fakeStorage as unknown as DurableObjectStorage);

    expect([...Object.values(fakeStorage.puts)]).toEqual([pos1]);

    const pos2 = pos(d(290,0), "B");
    tracker.add(pos2.fillPrice, pos2);
    tracker.remove("A");

    await tracker.flushToStorage(fakeStorage as unknown as DurableObjectStorage);

    expect(fakeStorage.deletes).toEqual(["position:280~0:0"]);
    expect([...Object.values(fakeStorage.puts)]).toEqual([pos2]);
});

test("update_price_affects_none_triggers_none", async () => {
    const tracker = new PeakPricePositionTracker(prefix());
    const fakeStorage = new FakeDurableObjectStorage();
    const events : (Position|Position[]|DecimalizedAmount|RemovePosition)[] = [
        // add 2 positions
        [pos(d(140,0), "A"), pos(d(150,0), "B")],
        // update price (will update peak for 1 position)
        d(139,0)
    ];

    const closers = (await runEvents(tracker, events, fakeStorage)).flatMap(x => x);

    expect(tracker.getPeakPrice("A")).toEqual(d(140,0));
    expect(tracker.getPosition("A")).toEqual(pos(d(140,0),"A"));

    expect(tracker.getPeakPrice("B")).toEqual(d(150,0));
    expect(tracker.getPosition("B")).toEqual(pos(d(150,0),"B"));

    expect(closers).toStrictEqual([]);
});

test("update_price_affects_some_triggers_none", async () => {
    const tracker = new PeakPricePositionTracker(prefix());
    const fakeStorage = new FakeDurableObjectStorage();
    const events : (Position|Position[]|DecimalizedAmount|RemovePosition)[] = [
        // add 2 positions
        [pos(d(140,0), "A"), pos(d(150,0), "B")],
        // update price (will update peak for 1 position)
        d(145,0)
    ];
    const closers = (await runEvents(tracker, events, fakeStorage)).flatMap(x => x);
    expect(tracker.getPeakPrice("A")).toEqual(d(145,0));
    expect(tracker.getPeakPrice("B")).toEqual(d(150,0));
    expect(closers).toStrictEqual([]);
});

test("update_price_affects_all_triggers_none", async () => {
    const tracker = new PeakPricePositionTracker(prefix());
    const fakeStorage = new FakeDurableObjectStorage();
    const events : (Position|Position[]|DecimalizedAmount|RemovePosition)[] = [
        // add 2 positions
        [pos(d(140,0), "A"), pos(d(150,0), "B")],
        // update price (will update peak for 2 positions)
        d(160,0)
    ];
    const closers = (await runEvents(tracker, events, fakeStorage)).flatMap(x => x);
    expect(tracker.getPeakPrice("A")).toEqual(d(160,0));
    expect(tracker.getPeakPrice("B")).toEqual(d(160,0));
    expect(closers).toStrictEqual([]);
});

test("update_price_updates_none_triggers_some", async () => {
    const tracker = new PeakPricePositionTracker(prefix());
    const fakeStorage = new FakeDurableObjectStorage();
    const events : (Position|Position[]|DecimalizedAmount|RemovePosition)[] = [
        // add 2 positions
        [pos(d(140,0), "A"), pos(d(150,0), "B")],
        // update price (will trigger 1 position)
        d(135,0)
    ];
    const closers = (await runEvents(tracker, events, fakeStorage)).flatMap(x => x);
    expect(tracker.getPeakPrice("A")).toEqual(d(140,0));
    expect(tracker.getPeakPrice("B")).toEqual(undefined);
    expect(tracker.getPosition("B")).toEqual(undefined);
    //expect(closers).toContainEqual(closed(pos(d(150,0), "B")));
    expect(closers).toContainEqual(expect.objectContaining({ positionID: "B" }));
});

test("update_price_triggers_some_updates_some", async () => {
    const tracker = new PeakPricePositionTracker(prefix());
    const fakeStorage = new FakeDurableObjectStorage();
    const events : (Position|Position[]|DecimalizedAmount|RemovePosition)[] = [
        // add 2 positions
        [pos(d(130,0), "A"), pos(d(150,0), "B")],
        // update price (will update peak for 1 position and trigger the other)
        d(135,0)
    ];
    const closers = (await runEvents(tracker, events, fakeStorage)).flatMap(x => x);
    expect(tracker.getPeakPrice("A")).toEqual(d(135,0));
    expect(tracker.getPeakPrice("B")).toEqual(undefined);
    expect(tracker.getPosition("B")).toEqual(undefined);
    expect(closers).toContainEqual(expect.objectContaining( { positionID : "B" }));
});

test("update_price_does_not_trigger_deleted_position", async () => {
    const tracker = new PeakPricePositionTracker(prefix());
    const fakeStorage = new FakeDurableObjectStorage();
    const events : (Position|Position[]|DecimalizedAmount|RemovePosition)[] = [
        // add 2 positions
        [pos(d(150,0), "A"), pos(d(150,0), "B")],
        // delete position that would be triggered
        { remove: "B" },
        // set price
        d(135,0)
    ];
    const closers = (await runEvents(tracker, events, fakeStorage)).flatMap(x => x);
    expect(closers).toContainEqual(expect.objectContaining({ positionID : "A" }));
    expect(closers).not.toContainEqual(expect.objectContaining( { positionID : "B" }));
});


async function runEvents(
    tracker: PeakPricePositionTracker, 
    events : (Position|Position[]|DecimalizedAmount|RemovePosition)[], 
    fakeStorage : FakeDurableObjectStorage) : Promise<Position[][]> {

    // storage actions, collected after each event
    const closedPositionGroups : Position[][] = [];
    const putGroups : Record<string,Position>[] = [];
    const deleteGroups : string[][] = [];
    
    // for each event
    for (const event of events) {
        // perform an operation on storage according to the kind of event
        if (isAddPositionEvent(event)) {
            tracker.add(event.fillPrice, event);
        }
        else if (isAddPositionsEvent(event)) {
            for (const position of event) {
                tracker.add(position.fillPrice, position);
            }
        }
        else if (isRemovePositionEvent(event)) {
            tracker.remove(event.remove);
        }
        else if (isUpdatePriceEvent(event)) {
            tracker.update(event);
            const positionsToClose = tracker.collectPositionsToClose(event);
            // if it's a close position request, 
            // go ahead and remove the position from the tracker
            for (const position of positionsToClose) {
                tracker.remove(position.positionID);
            }
            closedPositionGroups.push(positionsToClose);            
        }

        // flush the storage
        await tracker.flushToStorage(fakeStorage as unknown as DurableObjectStorage);
        // collect what happened to the storage
        putGroups.push(fakeStorage.puts);
        deleteGroups.push(fakeStorage.deletes);
    }
    // return all groups of close position requests
    return closedPositionGroups;
}

function prefix() {
    return "position";
}

function closed(pos : Position) : Position {
    const closedPos = {
        ...pos
    };
    closedPos.status = PositionStatus.Closed;
    return closedPos;
}

function closing(pos : Position) : Position {
    const closingPos = {
        ...pos
    };
    closingPos.status = PositionStatus.Closing;
    return closingPos;
}

function pos(initPrice : DecimalizedAmount, id : string = "ID", triggerPct : number = 10) {
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
        type: PositionType.LongTrailingStopLoss, // <--- important for test
        status: PositionStatus.Open, // <---- important for test
        token: fakeToken(),
        vsToken: getVsTokenInfo('SOL'),
        vsTokenAmt : amt_bought_in_sol, // 2 SOL
        tokenAmt: dMult(initPrice, amt_bought_in_sol),
        fillPrice : initPrice,
        sellSlippagePercent: 2,
        triggerPercent: 5,
        retrySellIfSlippageExceeded: true,
        txSignature: 'some-sig',
        confirmed: true,
        userAddress: { address : '' },
        fillPriceMS: 0,
        txBuySignature: '',
        txSellSignature: '',
        buyConfirmed: true, // <--- important to set or test will fail
        sellConfirmed: false,
        sellAutoDoubleSlippage: false,
        buyLastValidBlockheight: 0,
        sellLastValidBlockheight: null,
        netPNL: null,
        txBuyAttemptTimeMS: 0,
        txSellAttemptTimeMS: 0
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

interface RemovePosition {
    remove : string
}

function isAddPositionEvent(event : Position|Position[]|DecimalizedAmount|RemovePosition) : event is Position {
    return 'token' in event;
}

function isRemovePositionEvent(event : Position|Position[]|DecimalizedAmount|RemovePosition) : event is RemovePosition {
    return 'remove' in event;
}

function isUpdatePriceEvent(event : Position|Position[]|DecimalizedAmount|RemovePosition) : event is DecimalizedAmount {
    return 'tokenAmount' in event;
}

function isAddPositionsEvent(event : Position|Position[]|DecimalizedAmount|RemovePosition) : event is Position[] {
    return ('length' in event) && (!!event.length) && isAddPositionEvent((event as Position[])[0]);
}