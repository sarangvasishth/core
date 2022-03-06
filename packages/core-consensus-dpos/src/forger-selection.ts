import { Consensus } from "@arkecosystem/core-consensus";
import { Container } from "@arkecosystem/core-kernel";
import { ForgingInfo, MilestoneSearchResult } from "@arkecosystem/core-kernel/src/contracts/shared";
import { Crypto, Managers } from "@arkecosystem/crypto";

@Container.injectable()
export class ForgerSelection implements Consensus.ForgerSelection {
    public calculateForgingInfo(
        timestamp: number,
        height: number,
        getTimeStampForBlock: (blockheight: number) => number,
    ): ForgingInfo {
        const slotInfo = Crypto.Slots.getSlotInfo(getTimeStampForBlock, timestamp, height);

        const [currentForger, nextForger] = this.findIndex(height, slotInfo.slotNumber, getTimeStampForBlock);
        const canForge = slotInfo.forgingStatus;

        return { currentForger, nextForger, blockTimestamp: slotInfo.startTime, canForge };
    }

    private findIndex = (
        height: number,
        slotNumber: number,
        getTimeStampForBlock: (blockheight: number) => number,
    ): [number, number] => {
        let nextMilestone = Managers.configManager.getNextMilestoneWithNewKey(1, "activeDelegates");

        let lastSpanSlotNumber = 0;
        let activeDelegates = Managers.configManager.getMilestone(1).activeDelegates;

        const milestones = this.getMilestonesWhichAffectActiveDelegateCount();

        for (let i = 0; i < milestones.length - 1; i++) {
            if (height < nextMilestone.height) {
                break;
            }

            const lastSpanEndTime = getTimeStampForBlock(nextMilestone.height - 1);
            lastSpanSlotNumber =
                Crypto.Slots.getSlotInfo(getTimeStampForBlock, lastSpanEndTime, nextMilestone.height - 1).slotNumber +
                1;
            activeDelegates = nextMilestone.data;

            nextMilestone = Managers.configManager.getNextMilestoneWithNewKey(nextMilestone.height, "activeDelegates");
        }

        const currentForger = (slotNumber - lastSpanSlotNumber) % activeDelegates;
        const nextForger = (currentForger + 1) % activeDelegates;

        return [currentForger, nextForger];
    };

    private getMilestonesWhichAffectActiveDelegateCount = (): Array<MilestoneSearchResult> => {
        const milestones: Array<MilestoneSearchResult> = [
            {
                found: true,
                height: 1,
                data: Managers.configManager.getMilestone(1).activeDelegates,
            },
        ];

        let nextMilestone = Managers.configManager.getNextMilestoneWithNewKey(1, "activeDelegates");

        while (nextMilestone.found) {
            milestones.push(nextMilestone);
            nextMilestone = Managers.configManager.getNextMilestoneWithNewKey(nextMilestone.height, "activeDelegates");
        }

        return milestones;
    };
}
