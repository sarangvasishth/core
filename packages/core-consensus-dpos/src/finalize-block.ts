import { Consensus } from "@arkecosystem/core-consensus";
import { Container, Contracts, Utils } from "@arkecosystem/core-kernel";

@Container.injectable()
export class FinalizeBlock implements Consensus.FinalizeBlock {
    @Container.inject(Container.Identifiers.WalletRepository)
    @Container.tagged("state", "blockchain")
    private readonly walletRepository!: Contracts.State.WalletRepository;

    public increaseWalletForgerVoteBalance(wallet: Contracts.State.Wallet, amount: Utils.BigNumber) {
        if (wallet.hasVoted()) {
            const delegatePulicKey = wallet.getAttribute<string>("vote");
            const delegateWallet = this.walletRepository.findByPublicKey(delegatePulicKey);
            const oldDelegateVoteBalance = delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance");
            const newDelegateVoteBalance = oldDelegateVoteBalance.plus(amount);
            delegateWallet.setAttribute("delegate.voteBalance", newDelegateVoteBalance);
        }
    }
    public decreaseForgerWalletVoteBalance(wallet: Contracts.State.Wallet, amount: Utils.BigNumber) {
        if (wallet.hasVoted()) {
            const delegatePulicKey = wallet.getAttribute<string>("vote");
            const delegateWallet = this.walletRepository.findByPublicKey(delegatePulicKey);
            const oldDelegateVoteBalance = delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance");
            const newDelegateVoteBalance = oldDelegateVoteBalance.minus(amount);
            delegateWallet.setAttribute("delegate.voteBalance", newDelegateVoteBalance);
        }
    }
}
