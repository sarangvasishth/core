import { Providers } from "@arkecosystem/core-kernel";

export class ServiceProvider extends Providers.ServiceProvider {
    public async register(): Promise<void> {
        console.log("core-consensus registered!");
    }

    public async boot(): Promise<void> {
        console.log("core-consensus booted!");
    }

    public async dispose(): Promise<void> {
        console.log("core-consensus disposed!");
    }
}
