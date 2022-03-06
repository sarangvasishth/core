import { Managers } from "@arkecosystem/crypto";

export interface MilestoneSearchResult {
    found: boolean;
    height: number;
    data: any;
}

export const getMilestonesWhichAffectActiveDelegateCount = (): Array<MilestoneSearchResult> => {
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
