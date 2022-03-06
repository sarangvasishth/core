import { Contracts, Utils } from "@arkecosystem/core-kernel";

export interface FinalizeBlock {
    increaseWalletForgerVoteBalance(wallet: Contracts.State.Wallet, amount: Utils.BigNumber): void;
    decreaseForgerWalletVoteBalance(wallet: Contracts.State.Wallet, amount: Utils.BigNumber): void;
}
