import { Consensus } from "@arkecosystem/core-consensus";
import { Container, Contracts, Utils as AppUtils } from "@arkecosystem/core-kernel";
import { Handlers } from "@arkecosystem/core-transactions";
import { Enums, Identities, Interfaces } from "@arkecosystem/crypto";

// todo: review the implementation
@Container.injectable()
export class BlockState implements Contracts.State.BlockState {
    @Container.inject(Container.Identifiers.WalletRepository)
    private walletRepository!: Contracts.State.WalletRepository;

    @Container.inject(Container.Identifiers.TransactionHandlerRegistry)
    private handlerRegistry!: Handlers.Registry;

    @Container.inject(Container.Identifiers.StateStore)
    private readonly state!: Contracts.State.StateStore;

    @Container.inject(Container.Identifiers.LogService)
    private logger!: Contracts.Kernel.Logger;

    @Container.inject(Container.Identifiers.ConsensusFinalizeBlock)
    private finalizeBlock!: Consensus.FinalizeBlock;

    public async applyBlock(block: Interfaces.IBlock): Promise<void> {
        if (block.data.height === 1) {
            this.initGenesisForgerWallet(block.data.generatorPublicKey);
        }

        const previousBlock = this.state.getLastBlock();
        const forgerWallet = this.walletRepository.findByPublicKey(block.data.generatorPublicKey);
        /**
         * TODO: side-effect of findByPublicKey is that it creates a wallet if one isn't found - is that correct?
         * If so, this code can be deleted.
         */
        // if (!forgerWallet) {
        //     const msg = `Failed to lookup forger '${block.data.generatorPublicKey}' of block '${block.data.id}'.`;
        //     this.app.terminate(msg);
        // }
        const appliedTransactions: Interfaces.ITransaction[] = [];
        try {
            for (const transaction of block.transactions) {
                await this.applyTransaction(transaction);
                appliedTransactions.push(transaction);
            }
            this.finalizeBlock.applyBlockToForger(forgerWallet, block.data);

            this.state.setLastBlock(block);
        } catch (error) {
            this.logger.error(error.stack);
            this.logger.error("Failed to apply all transactions in block - reverting previous transactions");
            for (const transaction of appliedTransactions.reverse()) {
                await this.revertTransaction(transaction);
            }

            this.state.setLastBlock(previousBlock);

            throw error;
        }
    }

    public async revertBlock(block: Interfaces.IBlock): Promise<void> {
        const forgerWallet = this.walletRepository.findByPublicKey(block.data.generatorPublicKey);
        /**
         * TODO: side-effect of findByPublicKey is that it creates a wallet if one isn't found - is that correct?
         * If so, this code can be deleted.
         */
        // if (!forgerWallet) {
        //     const msg = `Failed to lookup forger '${block.data.generatorPublicKey}' of block '${block.data.id}'.`;
        //     this.app.terminate(msg);
        // }

        const revertedTransactions: Interfaces.ITransaction[] = [];
        try {
            this.finalizeBlock.revertBlockFromForger(forgerWallet, block.data);

            for (const transaction of block.transactions.slice().reverse()) {
                await this.revertTransaction(transaction);
                revertedTransactions.push(transaction);
            }
        } catch (error) {
            this.logger.error(error.stack);
            this.logger.error("Failed to revert all transactions in block - applying previous transactions");
            for (const transaction of revertedTransactions.reverse()) {
                await this.applyTransaction(transaction);
            }
            throw error;
        }
    }

    public async applyTransaction(transaction: Interfaces.ITransaction): Promise<void> {
        const transactionHandler = await this.handlerRegistry.getActivatedHandlerForData(transaction.data);

        let lockWallet: Contracts.State.Wallet | undefined;
        let lockTransaction: Interfaces.ITransactionData | undefined;
        if (
            transaction.type === Enums.TransactionType.HtlcClaim &&
            transaction.typeGroup === Enums.TransactionTypeGroup.Core
        ) {
            AppUtils.assert.defined<Interfaces.IHtlcClaimAsset>(transaction.data.asset?.claim);

            const lockId = transaction.data.asset.claim.lockTransactionId;
            lockWallet = this.walletRepository.findByIndex(Contracts.State.WalletIndexes.Locks, lockId);
            lockTransaction = lockWallet.getAttribute("htlc.locks", {})[lockId];
        }

        await transactionHandler.apply(transaction);

        AppUtils.assert.defined<string>(transaction.data.senderPublicKey);

        const sender: Contracts.State.Wallet = this.walletRepository.findByPublicKey(transaction.data.senderPublicKey);

        let recipient: Contracts.State.Wallet | undefined;
        if (transaction.data.recipientId) {
            AppUtils.assert.defined<string>(transaction.data.recipientId);

            recipient = this.walletRepository.findByAddress(transaction.data.recipientId);
        }

        // @ts-ignore - Apply vote balance updates
        this.finalizeBlock.applyVoteBalances(sender, recipient, transaction.data, lockWallet, lockTransaction);
    }

    public async revertTransaction(transaction: Interfaces.ITransaction): Promise<void> {
        const { data } = transaction;

        const transactionHandler = await this.handlerRegistry.getActivatedHandlerForData(transaction.data);

        AppUtils.assert.defined<string>(data.senderPublicKey);

        const sender: Contracts.State.Wallet = this.walletRepository.findByPublicKey(data.senderPublicKey);

        let recipient: Contracts.State.Wallet | undefined;
        if (transaction.data.recipientId) {
            AppUtils.assert.defined<string>(transaction.data.recipientId);

            recipient = this.walletRepository.findByAddress(transaction.data.recipientId);
        }

        await transactionHandler.revert(transaction);

        let lockWallet: Contracts.State.Wallet | undefined;
        let lockTransaction: Interfaces.ITransactionData | undefined;
        if (
            transaction.type === Enums.TransactionType.HtlcClaim &&
            transaction.typeGroup === Enums.TransactionTypeGroup.Core
        ) {
            AppUtils.assert.defined<Interfaces.IHtlcClaimAsset>(transaction.data.asset?.claim);

            const lockId = transaction.data.asset.claim.lockTransactionId;
            lockWallet = this.walletRepository.findByIndex(Contracts.State.WalletIndexes.Locks, lockId);
            lockTransaction = lockWallet.getAttribute("htlc.locks", {})[lockId];
        }

        // @ts-ignore - Revert vote balance updates
        this.finalizeBlock.revertVoteBalances(sender, recipient, data, lockWallet, lockTransaction);
    }

    private initGenesisForgerWallet(forgerPublicKey: string) {
        if (this.walletRepository.hasByPublicKey(forgerPublicKey)) {
            return;
        }

        const forgerAddress = Identities.Address.fromPublicKey(forgerPublicKey);
        const forgerWallet = this.walletRepository.createWallet(forgerAddress);
        forgerWallet.setPublicKey(forgerPublicKey);
        this.walletRepository.index(forgerWallet);
    }
}
