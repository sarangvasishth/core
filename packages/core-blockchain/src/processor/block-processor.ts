import { Consensus } from "@arkecosystem/core-consensus";
import { Container, Contracts, Utils as AppUtils } from "@arkecosystem/core-kernel";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import {
    AcceptBlockHandler,
    AlreadyForgedHandler,
    ExceptionHandler,
    IncompatibleTransactionsHandler,
    InvalidGeneratorHandler,
    NonceOutOfOrderHandler,
    UnchainedHandler,
    VerificationFailedHandler,
} from "./handlers";

export enum BlockProcessorResult {
    Accepted,
    DiscardedButCanBeBroadcasted,
    Rejected,
    Rollback,
    Reverted,
    Corrupted,
}

@Container.injectable()
export class BlockProcessor {
    @Container.inject(Container.Identifiers.Application)
    private readonly app!: Contracts.Kernel.Application;

    @Container.inject(Container.Identifiers.BlockchainService)
    private readonly blockchain!: Contracts.Blockchain.Blockchain;

    @Container.inject(Container.Identifiers.ConsensusBlockValidation)
    private readonly blockValidation!: Consensus.BlockValidation;

    public async process(block: Interfaces.IBlock): Promise<BlockProcessorResult> {
        if (Utils.isException({ ...block.data, transactions: block.transactions.map((tx) => tx.data) })) {
            return this.app.resolve<ExceptionHandler>(ExceptionHandler).execute(block);
        }

        if (!(await this.blockValidation.verifyBlock(block))) {
            return this.app.resolve<VerificationFailedHandler>(VerificationFailedHandler).execute(block);
        }

        if (this.blockValidation.blockContainsIncompatibleTransactions(block)) {
            return this.app.resolve<IncompatibleTransactionsHandler>(IncompatibleTransactionsHandler).execute();
        }

        if (this.blockValidation.blockContainsOutOfOrderNonce(block)) {
            return this.app.resolve<NonceOutOfOrderHandler>(NonceOutOfOrderHandler).execute();
        }

        const blockTimeLookup = await AppUtils.forgingInfoCalculator.getBlockTimeLookup(this.app, block.data.height);

        const isValidGenerator: boolean = await this.blockValidation.validateGenerator(block);
        const isChained: boolean = this.blockValidation.isBlockChained(
            this.blockchain.getLastBlock().data,
            block.data,
            blockTimeLookup,
        );
        if (!isChained) {
            return this.app.resolve<UnchainedHandler>(UnchainedHandler).initialize(isValidGenerator).execute(block);
        }

        if (!isValidGenerator) {
            return this.app.resolve<InvalidGeneratorHandler>(InvalidGeneratorHandler).execute(block);
        }

        const containsForgedTransactions: boolean = await this.blockValidation.checkBlockContainsForgedTransactions(
            block,
        );
        if (containsForgedTransactions) {
            return this.app.resolve<AlreadyForgedHandler>(AlreadyForgedHandler).execute(block);
        }

        return this.app.resolve<AcceptBlockHandler>(AcceptBlockHandler).execute(block);
    }
}
