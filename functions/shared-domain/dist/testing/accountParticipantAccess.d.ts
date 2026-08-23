import { type Account, type InstructorRelationship, type Participant, type ParticipantAccessTopology, type ParticipantBlock, type ParticipantManagement, type ParticipantManagementActiveOwnerGuard } from '../canonical/accountParticipantAccess';
export interface CanonicalParticipantAccessFixtures {
    readonly account: Account;
    readonly participant: Participant;
    readonly management: ParticipantManagement;
    readonly activeOwnerGuard: ParticipantManagementActiveOwnerGuard;
    readonly instructorRelationship: InstructorRelationship;
    readonly participantBlock: ParticipantBlock;
    readonly unblockedTopology: ParticipantAccessTopology;
    readonly blockedTopology: ParticipantAccessTopology;
}
export declare const canonicalParticipantAccessFixtures: CanonicalParticipantAccessFixtures;
