export declare const AndroidMotionEventAction: {
    readonly Down: 0;
    readonly Up: 1;
    readonly Move: 2;
    readonly Cancel: 3;
    readonly Outside: 4;
    readonly PointerDown: 5;
    readonly PointerUp: 6;
    readonly HoverMove: 7;
    readonly Scroll: 8;
    readonly HoverEnter: 9;
    readonly HoverExit: 10;
    readonly ButtonPress: 11;
    readonly ButtonRelease: 12;
};
export type AndroidMotionEventAction = (typeof AndroidMotionEventAction)[keyof typeof AndroidMotionEventAction];
export declare const AndroidMotionEventButton: {
    readonly None: 0;
    readonly Primary: 1;
    readonly Secondary: 2;
    readonly Tertiary: 4;
    readonly Back: 8;
    readonly Forward: 16;
    readonly StylusPrimary: 32;
    readonly StylusSecondary: 64;
};
export type AndroidMotionEventButton = (typeof AndroidMotionEventButton)[keyof typeof AndroidMotionEventButton];
//# sourceMappingURL=motion-event.d.ts.map