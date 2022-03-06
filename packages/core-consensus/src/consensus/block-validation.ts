import { Interfaces } from "@arkecosystem/crypto";

export interface BlockValidation {
    verifyBlock(block: Interfaces.IBlock): Promise<boolean>;
    blockContainsIncompatibleTransactions(block: Interfaces.IBlock): boolean;
    blockContainsOutOfOrderNonce(block: Interfaces.IBlock): boolean;
    validateGenerator(block: Interfaces.IBlock): Promise<boolean>;
    checkBlockContainsForgedTransactions(block: Interfaces.IBlock): Promise<boolean>;
    isBlockChained(
        previousBlock: Interfaces.IBlockData,
        nextBlock: Interfaces.IBlockData,
        getTimeStampForBlock: (blockheight: number) => number,
    ): boolean;
}
