"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    console.log('Starting background worker standalone context...');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    console.log('Worker Standalone context loaded. Schedulers & queue listeners initialized.');
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
//# sourceMappingURL=worker.js.map