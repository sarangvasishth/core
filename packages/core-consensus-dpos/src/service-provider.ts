import { Container, Providers } from "@arkecosystem/core-kernel";
import { BlockValidation } from "./block-validation";

export class ServiceProvider extends Providers.ServiceProvider {
    public async register(): Promise<void> {
        console.log("core-consensus-dpos registered!");

        this.app.bind(Container.Identifiers.ConsensusBlockValidation).to(BlockValidation);
    }

    public async boot(): Promise<void> {
        console.log("core-consensus-dpos booted!");
    }

    public async dispose(): Promise<void> {
        console.log("core-consensus-dpos disposed!");
    }
}
