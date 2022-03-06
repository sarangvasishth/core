export type BlockChainedDetails = {
    followsPrevious: boolean;
    isPlusOne: boolean;
    previousSlot: number;
    nextSlot: number;
    isAfterPreviousSlot: boolean;
    isChained: boolean;
};
