import { CallbackButton } from "./callback_button";

const emojis = {

    ':bot:': '🤖',

    ':winged_money:': '💸',
    ':dollars:': '💵',
    ':wallet:': '💰',
    ':eyes:': '👀',
    ':brain:': '🧠',

    ':notify:': '🔔',
    ':mountain:': '🏔️',
    ':wave:': '🌊',
    ':cart:': '🛒',

    ':red:': '🔴',
    ':yellow:': '🟡',
    ':orange:': '🟠',
    ':green:': '🟢',
    ':hollow:': '⚪',
    ':purple:': '🟣',

    ':down:': '🔻',
    ':up:': '💰', // irritating, but no green triangle up in emojis.
    ':equals:': '😑',
    ':ledger:': '📒',

    ':bullet:': '•',
    ':pencil:': '✏️',
    ':refresh:': '\u27F3',
    ':twisted_arrows:': '🔀',
    ':cancel:': '\u00D7',
    ':back:': '\u2190',
    ':thinking:': '🤔',


    ':chart_up:': '📈',
    ':chart_down:': '📉',
    ':rocket:': '🚀',
    ':roller_coaster:': '🎢',
    ':meh:': '😑',
    
    ':globe:': '🌍',
    ':whale:': '🐋',
    ':dolphin:': '🐬',
    ':shrimp:': '🦐',
    ':microbe:' : '🦠',

    ':lock:': '🔒', // closing position

    ':key:': '🔑',

    ':sparkle:' : '✨',
    
    ':briefcase:': '💼',
    ':envelope:': '✉️',
    ':ticket:': '🎟️',
    ':love_letter:': '💌',

    ':rage:': '🤬',
    ':anger:': '😠',
    ':disappointed:': '😞',
    ':indifference:': '😑',
    ':peanuts:': '🥜',
    ':happy:': '😊',
    ':beaming:': '😁',
    ':money_face:': '🤑',
    ':help:': '❔',
    ':stop:': '🛑',
    ':caution:': '🟡',
    ':none:': ''
}

type emojiTag = keyof typeof emojis;

export function interpretPct(pct: number) : emojiTag {
    if (pct < -50) {
        return ':rage:';
    }
    else if (pct < -1) {
        return ':chart_down:';
    }
    else if (pct < 1) {
        return ':meh:';
    }
    else if (pct < 50) {
        return ':chart_up:';
    }
    else {
        return ':rocket:';
    }
}

export function interpretPNL(pnl : number) : emojiTag {
    if (pnl < -10) {
        return ':rage:';
    }
    else if (pnl < -5) {
        return ':anger:';
    }
    else if (pnl <= -0.5) {
        return ':disappointed:'
    }
    else if (pnl < 0.0) {
        return ':meh:';
    }
    else if (pnl < 0.5) {
        return ':peanuts:';
    }
    else if (pnl < 5) {
        return ':happy:';
    }
    else if (pnl < 10) {
        return ':beaming:';
    }
    else {
        return ':money_face:';
    }
}

export function interpretPNLWithArrows(pnl : number) : emojiTag {
    if (pnl < 0) {
        return ':down:';
    }
    else if (pnl == 0) {
        return ':equals:';
    }
    else {
        return ':up:';
    }
}

export function interpretSOLAmount(amt : number) : emojiTag {
    if (amt <= 0.0001) {
        return ':microbe:';
    }
    if (amt <= 5) {
        return ':shrimp:';
    }
    else if (amt <= 10) {
        return ':dolphin:';
    }
    else if (amt <= 100) {
        return ':whale:';
    }
    else {
        return ':globe:';
    }
}

export function subInEmojis(text : string) : string {
    let processedText = text;
    Object.keys(emojis).forEach((placeholder) => {
        processedText = processedText.replace(new RegExp(placeholder, 'g'), emojis[placeholder as keyof typeof emojis]||'');
    });
    return processedText;
}

export function subInEmojisOnButtons(buttons : CallbackButton[][]) : CallbackButton[][] {
    for (const line of buttons) {
        for (const button of line) {
            button.text = subInEmojis(button.text);
        }
    }
    return buttons;
}