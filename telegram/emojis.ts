import { CallbackButton } from "./callback_button";

const emojis = {

    ':bot:': '🤖',

    ':winged_money:': '💸',
    ':dollars:': '💵',
    ':wallet:': '💰',

    ':notify:': '🔔',

    ':black-square:': '◾',
    ':big-black-square:': '⬛',
    ':down-red:': '🔻',
    ':bullet:': '•',
    ':pencil:': '✏️',
    ':refresh:': '🔄',
    ':twisted_arrows:': '🔀',
    ':cancel:': '🥜',

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

    ':folder:': '📁', // positions
    ':open_folder:': '📂',
    ':lock:': '🔒', // closing position

    ':key:': '🔑',

    ':sparkle:' : '✨',
    ':ledger:': '📒',
    ':money_bag:': '💰',
    ':credit_card:': '💳',
    ':gem:': '💎',
    ':bank:': '🏦',
    ':briefcase:': '💼',
    ':dead:': '💀',
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
    ':thumbs_up:': '👍', 
    ':thumbs_down:': '👎',


    ':sign:': '✍',
    ':help:': '🤔',

    ':bread:': '🍞',
    ':office:': '🏢',

    ':delivery_truck:': '🚚',
    ':stop:': '🛑',
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

export function interpretSOLAmount(amt : number) : emojiTag {
    if (amt <= 0.0001) {
        return ':microbe:';
    }
    if (amt <= 0.01) {
        return ':shrimp:';
    }
    else if (amt <= 5) {
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