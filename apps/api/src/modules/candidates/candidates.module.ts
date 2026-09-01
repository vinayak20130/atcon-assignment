import { Global, Module } from '@nestjs/common';
import { CandidateIdentityService } from './candidate-identity.service';

// Global because identity resolution is needed wherever a candidate can enter
// the system — public intake today, CSV import and referrals later.
@Global()
@Module({
  providers: [CandidateIdentityService],
  exports: [CandidateIdentityService],
})
export class CandidatesModule {}
