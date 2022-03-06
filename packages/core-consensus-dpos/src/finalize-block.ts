import { Consensus } from "@arkecosystem/core-consensus";
import { Container, Contracts, Utils } from "@arkecosystem/core-kernel";
import { Interfaces } from "@arkecosystem/crypto";

@Container.injectable()
export class FinalizeBlock implements Consensus.FinalizeBlock {
    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly walletRepository!: Contracts.State.WalletRepository;

    public applyBlockToForger(forgerWallet: Contracts.State.Wallet, blockData: Interfaces.IBlockData) {
        const delegateAttribute = forgerWallet.getAttribute<Contracts.State.WalletDelegateAttributes>("delegate");
        delegateAttribute.producedBlocks++;
        delegateAttribute.forgedFees = delegateAttribute.forgedFees.plus(blockData.totalFee);
        delegateAttribute.forgedRewards = delegateAttribute.forgedRewards.plus(blockData.reward);
        delegateAttribute.lastBlock = blockData;

        const balanceIncrease = blockData.reward.plus(blockData.totalFee);
        this.increaseForgerWalletVoteBalance(forgerWallet, balanceIncrease);
        forgerWallet.increaseBalance(balanceIncrease);
    }

    public revertBlockFromForger(forgerWallet: Contracts.State.Wallet, blockData: Interfaces.IBlockData) {
        const delegateAttribute = forgerWallet.getAttribute<Contracts.State.WalletDelegateAttributes>("delegate");
        delegateAttribute.producedBlocks--;
        delegateAttribute.forgedFees = delegateAttribute.forgedFees.minus(blockData.totalFee);
        delegateAttribute.forgedRewards = delegateAttribute.forgedRewards.minus(blockData.reward);
        delegateAttribute.lastBlock = undefined;

        const balanceDecrease = blockData.reward.plus(blockData.totalFee);
        this.decreaseForgerWalletVoteBalance(forgerWallet, balanceDecrease);
        forgerWallet.decreaseBalance(balanceDecrease);
    }

    private increaseForgerWalletVoteBalance(wallet: Contracts.State.Wallet, amount: Utils.BigNumber) {
        if (wallet.hasVoted()) {
            const delegatePulicKey = wallet.getAttribute<string>("vote");
            const delegateWallet = this.walletRepository.findByPublicKey(delegatePulicKey);
            const oldDelegateVoteBalance = delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance");
            const newDelegateVoteBalance = oldDelegateVoteBalance.plus(amount);
            delegateWallet.setAttribute("delegate.voteBalance", newDelegateVoteBalance);
        }
    }
    private decreaseForgerWalletVoteBalance(wallet: Contracts.State.Wallet, amount: Utils.BigNumber) {
        if (wallet.hasVoted()) {
            const delegatePulicKey = wallet.getAttribute<string>("vote");
            const delegateWallet = this.walletRepository.findByPublicKey(delegatePulicKey);
            const oldDelegateVoteBalance = delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance");
            const newDelegateVoteBalance = oldDelegateVoteBalance.minus(amount);
            delegateWallet.setAttribute("delegate.voteBalance", newDelegateVoteBalance);
        }
    }
}
