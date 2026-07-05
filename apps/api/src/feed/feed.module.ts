import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { TeamResolverService } from './team-resolver.service';

@Module({
  controllers: [FeedController],
  providers: [FeedService, TeamResolverService],
  exports: [FeedService, TeamResolverService],
})
export class FeedModule {}
