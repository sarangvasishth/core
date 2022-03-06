import { Contracts } from "@arkecosystem/core-kernel";
import { Interfaces } from "@arkecosystem/crypto";

export interface FinalizeBlock {
    applyBlockToForger(forgerWallet: Contracts.State.Wallet, blockData: Interfaces.IBlockData): void;
    revertBlockFromForger(forgerWallet: Contracts.State.Wallet, blockData: Interfaces.IBlockData): void;
    applyVoteBalances(
        sender: Contracts.State.Wallet,
        recipient: Contracts.State.Wallet,
        transaction: Interfaces.ITransactionData,
        lockWallet: Contracts.State.Wallet,
        lockTransaction: Interfaces.ITransactionData,
    ): void;
    revertVoteBalances(
        sender: Contracts.State.Wallet,
        recipient: Contracts.State.Wallet,
        transaction: Interfaces.ITransactionData,
        lockWallet: Contracts.State.Wallet,
        lockTransaction: Interfaces.ITransactionData,
    ): void;
}
