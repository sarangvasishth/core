import { Container, Providers } from "@arkecosystem/core-kernel";
import { BlockValidation } from "./block-validation";
import { FinalizeBlock } from "./finalize-block";
import { ForgerSelection } from "./forger-selection";

export class ServiceProvider extends Providers.ServiceProvider {
    public async register(): Promise<void> {
        console.log("core-consensus-dpos registered!");

        this.app.bind(Container.Identifiers.ConsensusBlockValidation).to(BlockValidation);
        this.app.bind(Container.Identifiers.ConsensusFinalizeBlock).to(FinalizeBlock);
        this.app.bind(Container.Identifiers.ConsensusForgerSelection).to(ForgerSelection);
    }

    public async boot(): Promise<void> {
        console.log("core-consensus-dpos booted!");
    }

    public async dispose(): Promise<void> {
        console.log("core-consensus-dpos disposed!");
    }
}
