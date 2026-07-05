import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('Starting background worker standalone context...');
  
  // Bootstrap NestJS application as a standalone context (no HTTP listener)
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('Worker Standalone context loaded. Schedulers & queue listeners initialized.');

  // Handle graceful shutdowns
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Closing application context...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received. Closing application context...');
    await app.close();
    process.exit(0);
  });
}

bootstrap();
