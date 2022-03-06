import { Repositories } from "@arkecosystem/core-database";
import { Crypto, Interfaces } from "@arkecosystem/crypto";
import { Consensus } from "@arkecosystem/core-consensus";
import { Container, Contracts, Utils, Services } from "@arkecosystem/core-kernel";
import { Handlers } from "@arkecosystem/core-transactions";
import { BlockChainedDetails } from "@arkecosystem/core-kernel/src/contracts/shared";

@Container.injectable()
export class BlockValidation implements Consensus.BlockValidation {
    @Container.inject(Container.Identifiers.Application)
    private readonly app!: Contracts.Kernel.Application;

    @Container.inject(Container.Identifiers.LogService)
    private readonly logger!: Contracts.Kernel.Logger;

    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly walletRepository!: Contracts.State.WalletRepository;

    @Container.inject(Container.Identifiers.TriggerService)
    private readonly triggers!: Services.Triggers.Triggers;

    @Container.inject(Container.Identifiers.StateStore)
    private readonly stateStore!: Contracts.State.StateStore;

    @Container.inject(Container.Identifiers.DatabaseTransactionRepository)
    private readonly transactionRepository!: Repositories.TransactionRepository;

    @Container.inject(Container.Identifiers.ConsensusForgerSelection)
    private readonly forgerSelection!: Consensus.ForgerSelection;

    public async verifyBlock(block: Interfaces.IBlock): Promise<boolean> {
        if (block.verification.containsMultiSignatures) {
            try {
                for (const transaction of block.transactions) {
                    const registry = this.app.getTagged<Handlers.Registry>(
                        Container.Identifiers.TransactionHandlerRegistry,
                        "state",
                        "blockchain",
                    );
                    const handler = await registry.getActivatedHandlerForData(transaction.data);
                    await handler.verify(transaction);
                }

                block.verification = block.verify();
            } catch (error) {
                this.logger.warning(`Failed to verify block, because: ${error.message}`);
                block.verification.verified = false;
            }
        }

        const { verified } = block.verification;
        if (!verified) {
            this.logger.warning(
                `Block ${block.data.height.toLocaleString()} (${
                    block.data.id
                }) disregarded because verification failed`,
            );

            this.logger.warning(JSON.stringify(block.verification, undefined, 4));

            return false;
        }

        return true;
    }

    public blockContainsIncompatibleTransactions(block: Interfaces.IBlock): boolean {
        for (let i = 1; i < block.transactions.length; i++) {
            if (block.transactions[i].data.version !== block.transactions[0].data.version) {
                return true;
            }
        }

        return false;
    }

    public blockContainsOutOfOrderNonce(block: Interfaces.IBlock): boolean {
        const nonceBySender = {};

        for (const transaction of block.transactions) {
            const data = transaction.data;

            if (data.version && data.version < 2) {
                break;
            }

            Utils.assert.defined<string>(data.senderPublicKey);

            const sender: string = data.senderPublicKey;

            if (nonceBySender[sender] === undefined) {
                nonceBySender[sender] = this.walletRepository.getNonce(sender);
            }

            Utils.assert.defined<string>(data.nonce);

            const nonce: Utils.BigNumber = data.nonce;

            if (!nonceBySender[sender].plus(1).isEqualTo(nonce)) {
                this.logger.warning(
                    `Block { height: ${block.data.height.toLocaleString()}, id: ${block.data.id} } ` +
                        `not accepted: invalid nonce order for sender ${sender}: ` +
                        `preceding nonce: ${nonceBySender[sender].toFixed()}, ` +
                        `transaction ${data.id} has nonce ${nonce.toFixed()}.`,
                );
                return true;
            }

            nonceBySender[sender] = nonce;
        }

        return false;
    }

    public async validateGenerator(block: Interfaces.IBlock): Promise<boolean> {
        const blockTimeLookup = await Utils.forgingInfoCalculator.getBlockTimeLookup(this.app, block.data.height);

        const roundInfo: Contracts.Shared.RoundInfo = Utils.roundCalculator.calculateRound(block.data.height);
        const delegates: Contracts.State.Wallet[] = (await this.triggers.call("getActiveDelegates", {
            roundInfo,
        })) as Contracts.State.Wallet[];

        const forgingInfo: Contracts.Shared.ForgingInfo = this.forgerSelection.calculateForgingInfo(
            block.data.timestamp,
            block.data.height,
            blockTimeLookup,
        );

        const forgingDelegate: Contracts.State.Wallet = delegates[forgingInfo.currentForger];

        const walletRepository = this.app.getTagged<Contracts.State.WalletRepository>(
            Container.Identifiers.WalletRepository,
            "state",
            "blockchain",
        );
        const generatorWallet: Contracts.State.Wallet = walletRepository.findByPublicKey(block.data.generatorPublicKey);

        let generatorUsername: string;
        try {
            generatorUsername = generatorWallet.getAttribute("delegate.username");
        } catch {
            return false;
        }

        if (!forgingDelegate) {
            this.logger.debug(
                `Could not decide if delegate ${generatorUsername} (${
                    block.data.generatorPublicKey
                }) is allowed to forge block ${block.data.height.toLocaleString()}`,
            );
        } /* istanbul ignore next */ else if (forgingDelegate.getPublicKey() !== block.data.generatorPublicKey) {
            Utils.assert.defined<string>(forgingDelegate.getPublicKey());

            const forgingWallet: Contracts.State.Wallet = walletRepository.findByPublicKey(
                forgingDelegate.getPublicKey()!,
            );
            const forgingUsername: string = forgingWallet.getAttribute("delegate.username");

            this.logger.warning(
                `Delegate ${generatorUsername} (${
                    block.data.generatorPublicKey
                }) not allowed to forge, should be ${forgingUsername} (${forgingDelegate.getPublicKey()})`,
            );

            return false;
        }

        this.logger.debug(
            `Delegate ${generatorUsername} (${
                block.data.generatorPublicKey
            }) allowed to forge block ${block.data.height.toLocaleString()}`,
        );

        return true;
    }

    public async checkBlockContainsForgedTransactions(block: Interfaces.IBlock): Promise<boolean> {
        if (block.transactions.length > 0) {
            const transactionIds = block.transactions.map((tx) => {
                Utils.assert.defined<string>(tx.id);

                return tx.id;
            });

            const forgedIds: string[] = await this.transactionRepository.getForgedTransactionsIds(transactionIds);

            if (this.stateStore.getLastBlock().data.height !== this.stateStore.getLastStoredBlockHeight()) {
                const transactionIdsSet = new Set<string>(transactionIds);

                for (const stateBlock of this.stateStore
                    .getLastBlocks()
                    .filter((block) => block.data.height > this.stateStore.getLastStoredBlockHeight())) {
                    stateBlock.transactions.forEach((tx) => {
                        Utils.assert.defined<string>(tx.id);

                        if (transactionIdsSet.has(tx.id)) {
                            forgedIds.push(tx.id);
                        }
                    });
                }
            }

            /* istanbul ignore else */
            if (forgedIds.length > 0) {
                this.logger.warning(
                    `Block ${block.data.height.toLocaleString()} disregarded, because it contains already forged transactions`,
                );

                this.logger.debug(`${JSON.stringify(forgedIds, undefined, 4)}`);

                return true;
            }
        }

        return false;
    }

    public isBlockChained = (
        previousBlock: Interfaces.IBlockData,
        nextBlock: Interfaces.IBlockData,
        getTimeStampForBlock: (blockheight: number) => number,
    ): boolean => {
        const details: BlockChainedDetails = this.getBlockChainedDetails(
            previousBlock,
            nextBlock,
            getTimeStampForBlock,
        );
        return details.isChained;
    };

    private getBlockChainedDetails = (
        previousBlock: Interfaces.IBlockData,
        nextBlock: Interfaces.IBlockData,
        getTimeStampForBlock: (blockheight: number) => number,
    ): BlockChainedDetails => {
        const followsPrevious: boolean = nextBlock.previousBlock === previousBlock.id;
        const isPlusOne: boolean = nextBlock.height === previousBlock.height + 1;

        const previousSlot: number = Crypto.Slots.getSlotNumber(getTimeStampForBlock, previousBlock.timestamp);
        const nextSlot: number = Crypto.Slots.getSlotNumber(getTimeStampForBlock, nextBlock.timestamp);
        const isAfterPreviousSlot: boolean = previousSlot < nextSlot;

        const isChained: boolean = followsPrevious && isPlusOne && isAfterPreviousSlot;

        return { followsPrevious, isPlusOne, previousSlot, nextSlot, isAfterPreviousSlot, isChained };
    };
}
