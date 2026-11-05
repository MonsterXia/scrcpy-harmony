export declare const AndroidKeyEventAction: {
    readonly Down: 0;
    readonly Up: 1;
};
export type AndroidKeyEventAction = (typeof AndroidKeyEventAction)[keyof typeof AndroidKeyEventAction];
export declare const AndroidKeyEventMeta: {
    readonly None: 0;
    readonly Alt: 2;
    readonly AltLeft: 16;
    readonly AltRight: 32;
    readonly Shift: 1;
    readonly ShiftLeft: 64;
    readonly ShiftRight: 128;
    readonly Ctrl: 4096;
    readonly CtrlLeft: 8192;
    readonly CtrlRight: 16384;
    readonly Meta: 65536;
    readonly MetaLeft: 131072;
    readonly MetaRight: 262144;
    readonly CapsLock: 1048576;
    readonly NumLock: 2097152;
    readonly ScrollLock: 4194304;
};
export type AndroidKeyEventMeta = (typeof AndroidKeyEventMeta)[keyof typeof AndroidKeyEventMeta];
export declare const AndroidKeyCode: {
    readonly AndroidHome: 3;
    readonly AndroidBack: 4;
    readonly AndroidCall: 5;
    readonly AndroidEndCall: 6;
    readonly Digit0: 7;
    readonly Digit1: 8;
    readonly Digit2: 9;
    readonly Digit3: 10;
    readonly Digit4: 11;
    readonly Digit5: 12;
    readonly Digit6: 13;
    readonly Digit7: 14;
    readonly Digit8: 15;
    readonly Digit9: 16;
    /**
     * '*' key.
     */
    readonly Star: 17;
    /**
     * '#' key.
     */
    readonly Pound: 18;
    /**
     * Directional Pad Up key.
     */
    readonly ArrowUp: 19;
    /**
     * Directional Pad Down key.
     */
    readonly ArrowDown: 20;
    /**
     * Directional Pad Left key.
     */
    readonly ArrowLeft: 21;
    /**
     * Directional Pad Right key.
     */
    readonly ArrowRight: 22;
    /**
     * Directional Pad Center key.
     */
    readonly AndroidDPadCenter: 23;
    readonly VolumeUp: 24;
    readonly VolumeDown: 25;
    readonly Power: 26;
    readonly AndroidCamera: 27;
    readonly Clear: 28;
    readonly KeyA: 29;
    readonly KeyB: 30;
    readonly KeyC: 31;
    readonly KeyD: 32;
    readonly KeyE: 33;
    readonly KeyF: 34;
    readonly KeyG: 35;
    readonly KeyH: 36;
    readonly KeyI: 37;
    readonly KeyJ: 38;
    readonly KeyK: 39;
    readonly KeyL: 40;
    readonly KeyM: 41;
    readonly KeyN: 42;
    readonly KeyO: 43;
    readonly KeyP: 44;
    readonly KeyQ: 45;
    readonly KeyR: 46;
    readonly KeyS: 47;
    readonly KeyT: 48;
    readonly KeyU: 49;
    readonly KeyV: 50;
    readonly KeyW: 51;
    readonly KeyX: 52;
    readonly KeyY: 53;
    readonly KeyZ: 54;
    readonly Comma: 55;
    readonly Period: 56;
    readonly AltLeft: 57;
    readonly AltRight: 58;
    readonly ShiftLeft: 59;
    readonly ShiftRight: 60;
    readonly Tab: 61;
    readonly Space: 62;
    readonly AndroidSymbol: 63;
    readonly AndroidExplorer: 64;
    readonly AndroidEnvelope: 65;
    readonly Enter: 66;
    readonly Backspace: 67;
    readonly Backquote: 68;
    readonly Minus: 69;
    readonly Equal: 70;
    readonly BracketLeft: 71;
    readonly BracketRight: 72;
    readonly Backslash: 73;
    readonly Semicolon: 74;
    readonly Quote: 75;
    readonly Slash: 76;
    readonly At: 77;
    readonly AndroidNum: 78;
    readonly AndroidHeadsetHook: 79;
    /**
     * Camera Focus key。
     */
    readonly AndroidFocus: 80;
    readonly Plus: 81;
    readonly ContextMenu: 82;
    readonly AndroidNotification: 83;
    readonly AndroidSearch: 84;
    readonly PageUp: 92;
    readonly PageDown: 93;
    readonly Escape: 111;
    readonly Delete: 112;
    readonly ControlLeft: 113;
    readonly ControlRight: 114;
    readonly CapsLock: 115;
    readonly ScrollLock: 116;
    readonly MetaLeft: 117;
    readonly MetaRight: 118;
    readonly AndroidFunction: 119;
    readonly PrintScreen: 120;
    readonly Pause: 121;
    readonly Home: 122;
    readonly End: 123;
    readonly Insert: 124;
    readonly AndroidForward: 125;
    readonly F1: 131;
    readonly F2: 132;
    readonly F3: 133;
    readonly F4: 134;
    readonly F5: 135;
    readonly F6: 136;
    readonly F7: 137;
    readonly F8: 138;
    readonly F9: 139;
    readonly F10: 140;
    readonly F11: 141;
    readonly F12: 142;
    readonly NumLock: 143;
    readonly Numpad0: 144;
    readonly Numpad1: 145;
    readonly Numpad2: 146;
    readonly Numpad3: 147;
    readonly Numpad4: 148;
    readonly Numpad5: 149;
    readonly Numpad6: 150;
    readonly Numpad7: 151;
    readonly Numpad8: 152;
    readonly Numpad9: 153;
    readonly NumpadDivide: 154;
    readonly NumpadMultiply: 155;
    readonly NumpadSubtract: 156;
    readonly NumpadAdd: 157;
    readonly NumpadDecimal: 158;
    readonly NumpadComma: 159;
    readonly NumpadEnter: 160;
    readonly NumpadEquals: 161;
    readonly NumpadLeftParen: 162;
    readonly NumpadRightParen: 163;
    readonly VolumeMute: 164;
    readonly AndroidAppSwitch: 187;
    readonly AndroidCut: 277;
    readonly AndroidCopy: 278;
    readonly AndroidPaste: 279;
};
export type AndroidKeyCode = (typeof AndroidKeyCode)[keyof typeof AndroidKeyCode];
export declare const AndroidKeyNames: Record<AndroidKeyCode, string>;
//# sourceMappingURL=key-event.d.ts.map