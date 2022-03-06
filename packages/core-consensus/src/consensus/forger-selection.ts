import { ForgingInfo } from "@arkecosystem/core-kernel/src/contracts/shared";

export interface ForgerSelection {
    calculateForgingInfo(
        timestamp: number,
        height: number,
        getTimeStampForBlock: (blockheight: number) => number,
    ): ForgingInfo;
}
