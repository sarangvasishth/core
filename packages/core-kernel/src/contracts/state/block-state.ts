import { Interfaces } from "@arkecosystem/crypto";

export interface BlockState {
    applyBlock(block: Interfaces.IBlock): Promise<void>;

    revertBlock(block: Interfaces.IBlock): Promise<void>;

    applyTransaction(transaction: Interfaces.ITransaction): Promise<void>;

    revertTransaction(transaction: Interfaces.ITransaction): Promise<void>;
}
