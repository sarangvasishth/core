import { Providers } from "@arkecosystem/core-kernel";

export class ServiceProvider extends Providers.ServiceProvider {
    public async register(): Promise<void> {
        console.log("core-consensus-dpos registered!");
    }

    public async boot(): Promise<void> {
        console.log("core-consensus-dpos booted!");
    }

    public async dispose(): Promise<void> {
        console.log("core-consensus-dpos disposed!");
    }
}
