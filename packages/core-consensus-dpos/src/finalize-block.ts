import { Consensus } from "@arkecosystem/core-consensus";
import { Container, Contracts, Utils } from "@arkecosystem/core-kernel";
import { Enums, Interfaces } from "@arkecosystem/crypto";

@Container.injectable()
export class FinalizeBlock implements Consensus.FinalizeBlock {
    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly walletRepository!: Contracts.State.WalletRepository;

    public applyBlockToForger(forgerWallet: Contracts.State.Wallet, blockData: Interfaces.IBlockData): void {
        const delegateAttribute = forgerWallet.getAttribute<Contracts.State.WalletDelegateAttributes>("delegate");
        delegateAttribute.producedBlocks++;
        delegateAttribute.forgedFees = delegateAttribute.forgedFees.plus(blockData.totalFee);
        delegateAttribute.forgedRewards = delegateAttribute.forgedRewards.plus(blockData.reward);
        delegateAttribute.lastBlock = blockData;

        const balanceIncrease = blockData.reward.plus(blockData.totalFee);
        this.increaseForgerWalletVoteBalance(forgerWallet, balanceIncrease);
        forgerWallet.increaseBalance(balanceIncrease);
    }

    public revertBlockFromForger(forgerWallet: Contracts.State.Wallet, blockData: Interfaces.IBlockData): void {
        const delegateAttribute = forgerWallet.getAttribute<Contracts.State.WalletDelegateAttributes>("delegate");
        delegateAttribute.producedBlocks--;
        delegateAttribute.forgedFees = delegateAttribute.forgedFees.minus(blockData.totalFee);
        delegateAttribute.forgedRewards = delegateAttribute.forgedRewards.minus(blockData.reward);
        delegateAttribute.lastBlock = undefined;

        const balanceDecrease = blockData.reward.plus(blockData.totalFee);
        this.decreaseForgerWalletVoteBalance(forgerWallet, balanceDecrease);
        forgerWallet.decreaseBalance(balanceDecrease);
    }

    public applyVoteBalances(
        sender: Contracts.State.Wallet,
        recipient: Contracts.State.Wallet,
        transaction: Interfaces.ITransactionData,
        lockWallet: Contracts.State.Wallet,
        lockTransaction: Interfaces.ITransactionData,
    ): void {
        return this.updateVoteBalances(sender, recipient, transaction, lockWallet, lockTransaction, false);
    }

    public revertVoteBalances(
        sender: Contracts.State.Wallet,
        recipient: Contracts.State.Wallet,
        transaction: Interfaces.ITransactionData,
        lockWallet: Contracts.State.Wallet,
        lockTransaction: Interfaces.ITransactionData,
    ): void {
        return this.updateVoteBalances(sender, recipient, transaction, lockWallet, lockTransaction, true);
    }

    private increaseForgerWalletVoteBalance(wallet: Contracts.State.Wallet, amount: Utils.BigNumber): void {
        if (wallet.hasVoted()) {
            const delegatePulicKey = wallet.getAttribute<string>("vote");
            const delegateWallet = this.walletRepository.findByPublicKey(delegatePulicKey);
            const oldDelegateVoteBalance = delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance");
            const newDelegateVoteBalance = oldDelegateVoteBalance.plus(amount);
            delegateWallet.setAttribute("delegate.voteBalance", newDelegateVoteBalance);
        }
    }
    private decreaseForgerWalletVoteBalance(wallet: Contracts.State.Wallet, amount: Utils.BigNumber): void {
        if (wallet.hasVoted()) {
            const delegatePulicKey = wallet.getAttribute<string>("vote");
            const delegateWallet = this.walletRepository.findByPublicKey(delegatePulicKey);
            const oldDelegateVoteBalance = delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance");
            const newDelegateVoteBalance = oldDelegateVoteBalance.minus(amount);
            delegateWallet.setAttribute("delegate.voteBalance", newDelegateVoteBalance);
        }
    }

    /**
     * Updates the vote balances of the respective delegates of sender and recipient.
     * If the transaction is not a vote...
     *    1. fee + amount is removed from the sender's delegate vote balance
     *    2. amount is added to the recipient's delegate vote balance
     *
     * in case of a vote...
     *    1. the full sender balance is added to the sender's delegate vote balance
     *
     * If revert is set to true, the operations are reversed (plus -> minus, minus -> plus).
     */
    private updateVoteBalances(
        sender: Contracts.State.Wallet,
        recipient: Contracts.State.Wallet,
        transaction: Interfaces.ITransactionData,
        lockWallet: Contracts.State.Wallet,
        lockTransaction: Interfaces.ITransactionData,
        revert: boolean,
    ): void {
        if (
            transaction.type === Enums.TransactionType.Vote &&
            transaction.typeGroup === Enums.TransactionTypeGroup.Core
        ) {
            Utils.assert.defined<Interfaces.ITransactionAsset>(transaction.asset?.votes);

            const senderDelegatedAmount = sender
                .getAttribute("htlc.lockedBalance", Utils.BigNumber.ZERO)
                .plus(sender.getBalance())
                // balance already includes reverted fee when updateVoteBalances is called
                .minus(revert ? transaction.fee : Utils.BigNumber.ZERO);

            for (let i = 0; i < transaction.asset.votes.length; i++) {
                const vote: string = transaction.asset.votes[i];
                const delegate: Contracts.State.Wallet = this.walletRepository.findByPublicKey(vote.substr(1));

                // first unvote also changes vote balance by fee
                const senderVoteDelegatedAmount =
                    i === 0 && vote.startsWith("-")
                        ? senderDelegatedAmount.plus(transaction.fee)
                        : senderDelegatedAmount;

                const voteBalanceChange: Utils.BigNumber = senderVoteDelegatedAmount
                    .times(vote.startsWith("-") ? -1 : 1)
                    .times(revert ? -1 : 1);

                const voteBalance: Utils.BigNumber = delegate
                    .getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO)
                    .plus(voteBalanceChange);

                delegate.setAttribute("delegate.voteBalance", voteBalance);
            }
        } else {
            // Update vote balance of the sender's delegate
            if (sender.hasVoted()) {
                const delegate: Contracts.State.Wallet = this.walletRepository.findByPublicKey(
                    sender.getAttribute("vote"),
                );

                let amount: Utils.BigNumber = transaction.amount;
                if (
                    transaction.type === Enums.TransactionType.MultiPayment &&
                    transaction.typeGroup === Enums.TransactionTypeGroup.Core
                ) {
                    Utils.assert.defined<Interfaces.IMultiPaymentItem[]>(transaction.asset?.payments);

                    amount = transaction.asset.payments.reduce(
                        (prev, curr) => prev.plus(curr.amount),
                        Utils.BigNumber.ZERO,
                    );
                }

                const total: Utils.BigNumber = amount.plus(transaction.fee);

                const voteBalance: Utils.BigNumber = delegate.getAttribute(
                    "delegate.voteBalance",
                    Utils.BigNumber.ZERO,
                );
                let newVoteBalance: Utils.BigNumber;

                if (
                    transaction.type === Enums.TransactionType.HtlcLock &&
                    transaction.typeGroup === Enums.TransactionTypeGroup.Core
                ) {
                    // HTLC Lock keeps the locked amount as the sender's delegate vote balance
                    newVoteBalance = revert ? voteBalance.plus(transaction.fee) : voteBalance.minus(transaction.fee);
                } else if (
                    transaction.type === Enums.TransactionType.HtlcClaim &&
                    transaction.typeGroup === Enums.TransactionTypeGroup.Core
                ) {
                    // HTLC Claim transfers the locked amount to the lock recipient's (= claim sender) delegate vote balance
                    newVoteBalance = revert
                        ? voteBalance.plus(transaction.fee).minus(lockTransaction.amount)
                        : voteBalance.minus(transaction.fee).plus(lockTransaction.amount);
                } else {
                    // General case : sender delegate vote balance reduced by amount + fees (or increased if revert)
                    newVoteBalance = revert ? voteBalance.plus(total) : voteBalance.minus(total);
                }
                delegate.setAttribute("delegate.voteBalance", newVoteBalance);
            }

            if (
                transaction.type === Enums.TransactionType.HtlcClaim &&
                transaction.typeGroup === Enums.TransactionTypeGroup.Core &&
                lockWallet.hasAttribute("vote")
            ) {
                // HTLC Claim transfers the locked amount to the lock recipient's (= claim sender) delegate vote balance
                const lockWalletDelegate: Contracts.State.Wallet = this.walletRepository.findByPublicKey(
                    lockWallet.getAttribute("vote"),
                );
                const lockWalletDelegateVoteBalance: Utils.BigNumber = lockWalletDelegate.getAttribute(
                    "delegate.voteBalance",
                    Utils.BigNumber.ZERO,
                );
                lockWalletDelegate.setAttribute(
                    "delegate.voteBalance",
                    revert
                        ? lockWalletDelegateVoteBalance.plus(lockTransaction.amount)
                        : lockWalletDelegateVoteBalance.minus(lockTransaction.amount),
                );
            }

            if (
                transaction.type === Enums.TransactionType.MultiPayment &&
                transaction.typeGroup === Enums.TransactionTypeGroup.Core
            ) {
                Utils.assert.defined<Interfaces.IMultiPaymentItem[]>(transaction.asset?.payments);

                // go through all payments and update recipients delegates vote balance
                for (const { recipientId, amount } of transaction.asset.payments) {
                    const recipientWallet: Contracts.State.Wallet = this.walletRepository.findByAddress(recipientId);
                    if (recipientWallet.hasVoted()) {
                        const vote = recipientWallet.getAttribute("vote");
                        const delegate: Contracts.State.Wallet = this.walletRepository.findByPublicKey(vote);
                        const voteBalance: Utils.BigNumber = delegate.getAttribute(
                            "delegate.voteBalance",
                            Utils.BigNumber.ZERO,
                        );
                        delegate.setAttribute(
                            "delegate.voteBalance",
                            revert ? voteBalance.minus(amount) : voteBalance.plus(amount),
                        );
                    }
                }
            }

            // Update vote balance of recipient's delegate
            if (
                recipient &&
                recipient.hasVoted() &&
                (transaction.type !== Enums.TransactionType.HtlcLock ||
                    transaction.typeGroup !== Enums.TransactionTypeGroup.Core)
            ) {
                const delegate: Contracts.State.Wallet = this.walletRepository.findByPublicKey(
                    recipient.getAttribute("vote"),
                );
                const voteBalance: Utils.BigNumber = delegate.getAttribute(
                    "delegate.voteBalance",
                    Utils.BigNumber.ZERO,
                );

                delegate.setAttribute(
                    "delegate.voteBalance",
                    revert ? voteBalance.minus(transaction.amount) : voteBalance.plus(transaction.amount),
                );
            }
        }
    }
}
