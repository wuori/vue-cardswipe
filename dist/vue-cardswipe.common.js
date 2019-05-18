/*!
 * vue-cardswipe v0.1.0 
 * (c) 2019 Michael Wuori
 * Released under the MIT License.
 */
'use strict';

var cardSwipe$1 = {

    cardSwipe: undefined,
    settings: {},
    init: function (options){
        return cardSwipe$1.methods.init(options);
    },

    // Built-in parsers. These include simplistic credit card parsers that
    // recognize various card issuers based on patterns of the account number.
    // There is no guarantee these are correct or complete; they are based
    // on information from Wikipedia.
    // Account numbers are validated by the Luhn checksum algorithm.
    builtinParsers: {

        // Generic parser. Separates raw data into up to three lines.
        generic: function (rawData) {
            var pattern = new RegExp("^(%[^%;\\?]+\\?)?(;[0-9\\:<>\\=]+\\?)?([+;][0-9\\:<>\\=]+\\?)?");

            var match = pattern.exec(rawData);
            if (!match) { return null; }

            // Extract the three lines
            var cardData = {
                type: "generic",
                line1: match[1] ? match[1].slice(1, -1) : "",
                line2: match[2] ? match[2].slice(1, -1) : "",
                line3: match[3] ? match[3].slice(1, -1) : ""
            };

            return cardData;
        },


        // Visa card parser.
        visa: function (rawData) {
            // Visa issuer number begins with 4 and may vary from 13 to 19 total digits. 16 digits is most common.
            var pattern = new RegExp("^%B(4[0-9]{12,18})\\^([A-Z ]+)/([A-Z ]+)(\\.[A-Z ]+)?\\^([0-9]{2})([0-9]{2})");

            var match = pattern.exec(rawData);
            if (!match) { return null; }

            var account = match[1];
            if (!cardSwipe$1.luhnChecksum(account))
                { return null; }

            var cardData = {
                type: "visa",
                account: account,
                lastName: match[2].trim(),
                firstName: match[3].trim(),
                honorific: match[4] ? match[4].trim().slice(1) : "",
                expYear: match[5],
                expMonth: match[6]
            };

            return cardData;
        },

        // MasterCard parser.
        mastercard: function (rawData) {
            // MasterCard starts with 51-55, and is 16 digits long.
            var pattern = new RegExp("^%B(5[1-5][0-9]{14})\\^([A-Z ]+)/([A-Z ]+)(\\.[A-Z ]+)?\\^([0-9]{2})([0-9]{2})");

            var match = pattern.exec(rawData);
            if (!match) { return null; }

            var account = match[1];
            if (!cardSwipe$1.luhnChecksum(account))
                { return null; }

            var cardData = {
                type: "mastercard",
                account: account,
                lastName: match[2],
                firstName: match[3],
                honorific: match[4] ? match[4].trim().slice(1) : "",
                expYear: match[5],
                expMonth: match[6]
            };

            return cardData;
        },

        // Discover parser.
        discover: function (rawData) {
            // discover starts with 6, and is 16 digits long.
            var pattern = new RegExp("^%B(6[0-9]{15})\\^([A-Z ]+)/([A-Z ]+)(\\.[A-Z ]+)?\\^([0-9]{2})([0-9]{2})");

            var match = pattern.exec(rawData);
            if (!match) { return null; }

            var account = match[1];
            if (!cardSwipe$1.luhnChecksum(account))
                { return null; }

            var cardData = {
                type: "discover",
                account: account,
                lastName: match[2],
                firstName: match[3],
                honorific: match[4] ? match[4].trim().slice(1) : "",
                expYear: match[5],
                expMonth: match[6]
            };

            return cardData;
        },

        // American Express parser
        amex: function (rawData) {
            // American Express starts with 34 or 37, and is 15 digits long.
            var pattern = new RegExp("^%B(3[4|7][0-9]{13})\\^([A-Z ]+)/([A-Z ]+)(\\.[A-Z ]+)?\\^([0-9]{2})([0-9]{2})");

            var match = pattern.exec(rawData);
            if (!match) { return null; }

            var account = match[1];
            if (!cardSwipe$1.luhnChecksum(account))
                { return null; }

            var cardData = {
                type: "amex",
                account: account,
                lastName: match[2],
                firstName: match[3],
                honorific: match[4] ? match[4].trim().slice(1) : "",
                expYear: match[5],
                expMonth: match[6]
            };

            return cardData;
        }
    },

    // State definitions:
    states: { IDLE: 0, PENDING1: 1, PENDING2: 2, READING: 3, DISCARD: 4, PREFIX: 5 },

    // State names used when debugging.
    stateNames: { 0: 'IDLE', 1: 'PENDING1', 2: 'PENDING2', 3: 'READING', 4: 'DISCARD', 5: 'PREFIX' },

    // Holds current state. Update only through state function.
    currentState: 0,

    // Gets or sets the current state.
    state: function () {

        if (arguments.length === 0) {
            return cardSwipe$1.currentState;
        }

        // Set new state.
        var newState = arguments[0];
        if (newState == cardSwipe$1.state)
            { return; }

        if (cardSwipe$1.settings.debug) { console.log("%s -> %s", cardSwipe$1.stateNames[cardSwipe$1.currentState], cardSwipe$1.stateNames[newState]); }

        // Raise events when entering and leaving the READING state
        if (newState == cardSwipe$1.states.READING){
            var event = new CustomEvent('scanstart.cardswipe');
            document.dispatchEvent(event);
        }

        if (cardSwipe$1.currentState == cardSwipe$1.states.READING){
            var event$1 = new CustomEvent('scanend.cardswipe');
            document.dispatchEvent(event$1);
        }

        cardSwipe$1.currentState = newState;
    },

    // Array holding scanned characters
    scanbuffer: [],

    // Interdigit timer
    timerHandle: 0,

    // Keypress listener
    listener: function (e) {
        if (cardSwipe$1.settings.debug) { console.log(e.which + ': ' + String.fromCharCode(e.which)); }
        switch (cardSwipe$1.state()) {

            // IDLE: Look for prfix characters or line 1 or line 2 start
            // characters, and jump to PENDING1 or PENDING2.
            case cardSwipe$1.states.IDLE:
                // Look for prefix characters, and jump to PREFIX.
                if (cardSwipe$1.isInPrefixCodes(e.which)) {
                    cardSwipe$1.state(cardSwipe$1.states.PREFIX);
                    e.preventDefault();
                    e.stopPropagation();
                    cardSwipe$1.startTimer();
                }

                // Cards with (and readers reading) line 1:
                // look for '%', and jump to PENDING1.
                if (e.which == 37) {
                    cardSwipe$1.state(cardSwipe$1.states.PENDING1);
                    cardSwipe$1.scanbuffer = [];
                    cardSwipe$1.processCode(e.which);
                    e.preventDefault();
                    e.stopPropagation();
                    cardSwipe$1.startTimer();
                }

                // Cards without (or readers ignoring) line 1:
                // look for ';', and jump to PENDING_LINE
                if (e.which == 59) {
                    cardSwipe$1.state(cardSwipe$1.states.PENDING2);
                    cardSwipe$1.scanbuffer = [];
                    cardSwipe$1.processCode(e.which);
                    e.preventDefault();
                    e.stopPropagation();
                    cardSwipe$1.startTimer();
                }

                break;

            // PENDING1: Look for A-Z then jump to READING.
            // Otherwise, pass the keypress through, reset and jump to IDLE.
            case cardSwipe$1.states.PENDING1:
                // Look for format code character, A-Z. Almost always B for cards
                // used by the general public. Some reader / OS combinations
                // will issue lowercase characters when the caps lock key is on.
                if ((e.which >= 65 && e.which <= 90) || (e.which >= 97 && e.which <= 122)) {
                    cardSwipe$1.state(cardSwipe$1.states.READING);

                    // Leaving focus on a form element wreaks browser-dependent
                    // havoc because of keyup and keydown events.  This is a
                    // cross-browser way to prevent trouble.
                    var el = document.querySelector(':focus');
                    if (el) { el.blur(); }

                    cardSwipe$1.processCode(e.which);
                    e.preventDefault();
                    e.stopPropagation();
                    cardSwipe$1.startTimer();
                }
                else {
                    cardSwipe$1.clearTimer();
                    cardSwipe$1.scanbuffer = null;
                    cardSwipe$1.state(cardSwipe$1.states.IDLE);
                }
                break;

            // PENDING_LINE2: look for 0-9, then jump to READING.
            // Otherwise, pass the keypress through, reset and jump to IDLE.
            case cardSwipe$1.states.PENDING2:
                // Look for digit.
                if ((e.which >= 48 && e.which <= 57)) {
                    swipeData.state(cardSwipe$1.states.READING);

                    $("input").blur();

                    cardSwipe$1.processCode(e.which);
                    e.preventDefault();
                    e.stopPropagation();
                    cardSwipe$1.startTimer();
                }
                else {
                    cardSwipe$1.clearTimer();
                    cardSwipe$1.scanbuffer = null;
                    cardSwipe$1.state(cardSwipe$1.states.IDLE);
                }
                break;

            // READING: Copy characters to buffer until newline, then process the scanned characters
            case cardSwipe$1.states.READING:
                cardSwipe$1.processCode(e.which);
                cardSwipe$1.startTimer();
                e.preventDefault();
                e.stopPropagation();

                // Carriage return indicates end of scan
                if (e.which == 13) {
                    cardSwipe$1.clearTimer();
                    cardSwipe$1.state(cardSwipe$1.states.IDLE);
                    cardSwipe$1.processScan();
                }

                if (cardSwipe$1.settings.firstLineOnly && e.which == 63) {
                    // End of line 1.  Return early, and eat remaining characters.
                    cardSwipe$1.state(cardSwipe$1.states.DISCARD);
                    cardSwipe$1.processScan();
                }
                break;

            // DISCARD: Eat up characters until newline, then jump to IDLE
            case cardSwipe$1.states.DISCARD:
                e.preventDefault();
                e.stopPropagation();
                if (e.which == 13) {
                    cardSwipe$1.clearTimer();
                    cardSwipe$1.state(cardSwipe$1.states.IDLE);
                    return;
                }

                cardSwipe$1.startTimer();
                break;

            // PREFIX: Eat up characters until % is seen, then jump to PENDING1
            case cardSwipe$1.states.PREFIX:

                // If prefix character again, pass it through and return to IDLE state.
                if (cardSwipe$1.isInPrefixCodes(e.which)) {
                    cardSwipe$1.state(states.IDLE);
                    return;
                }

                // Eat character.
                e.preventDefault();
                e.stopPropagation();
                // Look for '%'
                if (e.which == 37) {
                    cardSwipe$1.state(states.PENDING1);
                    cardSwipe$1.scanbuffer = [];
                    cardSwipe$1.processCode(e.which);
                }
                // Look for ';'
                if (e.which == 59) {
                    cardSwipe$1. state(states.PENDING2);
                    cardSwipe$1.scanbuffer = [];
                    cardSwipe$1.processCode(e.which);
                }
                cardSwipe$1.startTimer();
        }
    },

    // Converts a scancode to a character and appends it to the buffer.
    processCode: function (code) {
        cardSwipe$1.scanbuffer.push(String.fromCharCode(code));
    },

    startTimer: function () {
        clearTimeout(cardSwipe$1.timerHandle);
        cardSwipe$1.timerHandle = setTimeout(cardSwipe$1.onTimeout, cardSwipe$1.settings.interdigitTimeout);
    },

    clearTimer: function () {
        clearTimeout(cardSwipe$1.timerHandle);
        cardSwipe$1.timerHandle = 0;
    },

    // Invoked when the timer lapses.
    onTimeout: function () {
        if (cardSwipe$1.settings.debug) { console.log('Timeout!'); }
        if (cardSwipe$1.state() == cardSwipe$1.states.READING) {
            cardSwipe$1.processScan();
        }
        cardSwipe$1.scanbuffer = null;
        cardSwipe$1.state(states.IDLE);
    },

    // Processes the scanned card
    processScan: function () {

        if (cardSwipe$1.settings.debug) {
            console.log(cardSwipe$1.scanbuffer);
        }

        var rawData = cardSwipe$1.scanbuffer.join('');

        // Invoke rawData callback if defined, a testing hook.
        if (cardSwipe$1.settings.rawDataCallback) { settings.rawDataCallback.call(this, rawData); }

        var result = cardSwipe$1.parseData(rawData);

        if (result) {
            // Scan complete. Invoke callback
            if (cardSwipe$1.settings.success) { cardSwipe$1.settings.success.call(this, result); }

            // Raise success event.
            var event = new CustomEvent('success.cardswipe', { detail: { result: result }});
            document.dispatchEvent(event);
        }
        else {
            // All parsers failed.
            if (cardSwipe$1.settings.failure) { settings.failure.call(this, rawData); }
            document.dispatchEvent("failure.cardswipe");
        }
    },

    // Invokes parsers until one succeeds, and returns the parsed result,
    // or null if none succeed.
    parseData: function (rawData) {
        var this$1 = this;

        for (var i = 0; i < cardSwipe$1.settings.parsers.length; i++) {
            var ref = cardSwipe$1.settings.parsers[i];
            console.log('ref', ref);
            var parser = (void 0);

            // ref is a function or the name of a builtin parser
            if (typeof (ref) === "function") {
                parser = ref;
            }
            else if (typeof (ref) === "string") {
                parser = cardSwipe$1.builtinParsers[ref];
            }

            if (parser != null) {
                var parsedData = parser.call(this$1, rawData);
                if (parsedData == null)
                    { continue; }

                return parsedData;
            }
        }

        // All parsers failed.
        return null;
    },

    // Binds the event listener
    bindListener: function () {
        $(document).on("keypress.cardswipe-listener", cardSwipe$1.listener);
    },

    // Unbinds the event listener
    unbindListener: function () {
        $(document).off(".cardswipe-listener", cardSwipe$1.listener);
    },

    // Default callback used if no other specified. Works with default parser.
    defaultSuccessCallback: function (cardData) {
        var text = ['Line 1: ', cardData.line1, '\nLine 2: ', cardData.line2, '\nLine 3: ', cardData.line3].join('');
        alert(text);
    },

    isInPrefixCodes: function (arg) {
        if (!cardSwipe$1.settings.prefixCodes) {
            return false;
        }
        return $.inArray(arg, cardSwipe$1.settings.prefixCodes) != -1;
    },

    // Apply the Luhn checksum test.  Returns true on a valid account number.
    // The input is assumed to be a string containing only digits.
    luhnChecksum: function (digits) {
        var map = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9];
        var sum = 0;

        // Proceed right to left. Even and odd digit positions are handled differently.
        var n = digits.length;
        var odd = true;
        while (n--) {
            var d = parseInt(digits.charAt(n), 10);
            if (odd) {
                // Odd digits used as is
                sum += d;
            }
            else {
                // Even digits mapped
                sum += map[d];
            }

            odd = !odd;
        }

        return sum % 10 === 0 && sum > 0;
    },

    // Callable plugin methods
    methods: {
        init: function (options) {
            var this$1 = this;

            var defaults = {
                enabled: true,
                interdigitTimeout: 250,
                success: cardSwipe$1.defaultSuccessCallback,
                failure: null,
                parsers: ["visa", "mastercard", "amex", "discover", "generic"],
                firstLineOnly: false,
                prefixCharacter: null,
                debug: false
            };

            cardSwipe$1.settings = $.extend({}, defaults, options);

            // Is a prefix character defined?
            if (cardSwipe$1.settings.prefixCharacter) {

                // Check if prefix character is an array, if its not, convert
                var isPrefixCharacterArray = Object.prototype.toString.call(cardSwipe$1.settings.prefixCharacter) === '[object Array]';
                if (!isPrefixCharacterArray) {
                    cardSwipe$1.settings.prefixCharacter = [settings.prefixCharacter];
                }

                cardSwipe$1.settings.prefixCodes = [];
                for (var i in cardSwipe$1.settings.prefixCharacter){
                    if (cardSwipe$1.settings.prefixCharacter[i].length != 1) {
                        throw 'prefixCharacter must be a single character';
                    }
                    // convert to character code
                    settings.prefixCodes.push(this$1.charCodeAt(0));
                }
            }

            // Reset state
            cardSwipe$1.clearTimer();
            cardSwipe$1.state(cardSwipe$1.states.IDLE);
            cardSwipe$1.scanbuffer = null;
            cardSwipe$1.unbindListener();

            if (cardSwipe$1.settings.enabled)
                { cardSwipe$1.methods.enable(); }
        },

        disable: function () {
            cardSwipe$1.unbindListener();
        },

        enable: function () {
            cardSwipe$1.bindListener();
        }
    }

};

var VueCardSwipe = {
  install: function install(vue, opts) {
    // provide plugin to Vue
    Vue.prototype.$cardSwipe = cardSwipe$1;
    // Vue.mixin({
    //   mounted() {
    //     cardSwipe.methods.init(opts);
    //   }
    // });
  }
};

if (typeof window !== 'undefined' && window.Vue) {
  window.Vue.use(VueCardSwipe);
}

module.exports = cardSwipe$1;
