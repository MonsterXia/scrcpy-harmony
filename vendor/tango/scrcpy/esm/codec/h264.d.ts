export declare const AndroidAvcProfile: {
    Baseline: number;
    Main: number;
    Extended: number;
    High: number;
    High10: number;
    High422: number;
    High444: number;
    ConstrainedBaseline: number;
    ConstrainedHigh: number;
};
export declare const AndroidAvcLevel: {
    Level1: number;
    Level1b: number;
    Level11: number;
    Level12: number;
    Level13: number;
    Level2: number;
    Level21: number;
    Level22: number;
    Level3: number;
    Level31: number;
    Level32: number;
    Level4: number;
    Level41: number;
    Level42: number;
    Level5: number;
    Level51: number;
    Level52: number;
    Level6: number;
    Level61: number;
    Level62: number;
};
export declare function h264ParseSequenceParameterSet(nalu: Uint8Array): {
    profile_idc: number;
    constraint_set: number;
    constraint_set0_flag: boolean;
    constraint_set1_flag: boolean;
    constraint_set2_flag: boolean;
    constraint_set3_flag: boolean;
    constraint_set4_flag: boolean;
    constraint_set5_flag: boolean;
    level_idc: number;
    seq_parameter_set_id: number;
    pic_width_in_mbs_minus1: number;
    pic_height_in_map_units_minus1: number;
    frame_mbs_only_flag: number;
    frame_cropping_flag: boolean;
    frame_crop_left_offset: number;
    frame_crop_right_offset: number;
    frame_crop_top_offset: number;
    frame_crop_bottom_offset: number;
};
/**
 * Find Sequence Parameter Set (SPS) and Picture Parameter Set (PPS)
 * from H.264 Annex B formatted data.
 */
export declare function h264SearchConfiguration(buffer: Uint8Array): {
    sequenceParameterSet: Uint8Array<ArrayBufferLike>;
    pictureParameterSet: Uint8Array<ArrayBufferLike>;
};
export interface H264Configuration {
    pictureParameterSet: Uint8Array;
    sequenceParameterSet: Uint8Array;
    profileIndex: number;
    constraintSet: number;
    levelIndex: number;
    encodedWidth: number;
    encodedHeight: number;
    cropLeft: number;
    cropRight: number;
    cropTop: number;
    cropBottom: number;
    croppedWidth: number;
    croppedHeight: number;
}
export declare function h264ParseConfiguration(data: Uint8Array): H264Configuration;
//# sourceMappingURL=h264.d.ts.map