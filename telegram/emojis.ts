import { CallbackButton } from "./callback_button";

const emojis = {

    ':bot:': '🤖',

    ':dollars:': '💵',
    ':wallet:': '💰',
    ':eyes:': '👀',
    ':brain:': '🧠',
    ':settings:': '⚙️',

    ':notify:': '🔔',
    ':mountain:': '🏔️',
    ':wave:': '🌊',
    ':deactivated:': '🧊',

    ':red:': '🔴',
    ':yellow:': '🟡',
    ':orange:': '🟠',
    ':green:': '🟢',
    ':hollow:': '⚪',
    ':purple:': '🟣',
    ':blue:': '🔵',

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
    ':priority_fees:': '🚀',

    ':key:': '🔑',

    ':sparkle:' : '✨',
    
    ':briefcase:': '💼',
    ':ticket:': '🎟️',
    ':love_letter:': '💌',
    ":down_arrow:": '↓',

    ':help:': '❔',
    ':none:': '',
    ':space:': ' '
}

type emojiTag = keyof typeof emojis;


export function asChartEmoji(pnl : number) : emojiTag {
    if (pnl < 0) {
        return ':chart_down:';
    }
    else if (pnl > 0) {
        return ':chart_up:';
    }
    else {
        return ':space:';
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