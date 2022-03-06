import { Contracts } from "@arkecosystem/core-kernel";
import { Interfaces } from "@arkecosystem/crypto";

export interface FinalizeBlock {
    applyBlockToForger(forgerWallet: Contracts.State.Wallet, blockData: Interfaces.IBlockData): void;
    revertBlockFromForger(forgerWallet: Contracts.State.Wallet, blockData: Interfaces.IBlockData): void;
}
