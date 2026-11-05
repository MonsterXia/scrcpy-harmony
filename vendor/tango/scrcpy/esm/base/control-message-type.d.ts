export declare const ScrcpyControlMessageType: {
    readonly InjectKeyCode: 0;
    readonly InjectText: 1;
    readonly InjectTouch: 2;
    readonly InjectScroll: 3;
    readonly BackOrScreenOn: 4;
    readonly ExpandNotificationPanel: 5;
    readonly ExpandSettingPanel: 6;
    readonly CollapseNotificationPanel: 7;
    readonly GetClipboard: 8;
    readonly SetClipboard: 9;
    readonly SetDisplayPower: 10;
    readonly RotateDevice: 11;
    readonly UHidCreate: 12;
    readonly UHidInput: 13;
    readonly UHidDestroy: 14;
    readonly OpenHardKeyboardSettings: 15;
    readonly StartApp: 16;
    readonly ResetVideo: 17;
};
export type ScrcpyControlMessageType = (typeof ScrcpyControlMessageType)[keyof typeof ScrcpyControlMessageType];
//# sourceMappingURL=control-message-type.d.ts.map