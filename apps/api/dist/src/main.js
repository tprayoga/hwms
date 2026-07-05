"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const jwt_secret_1 = require("./auth/jwt-secret");
const cookieParser = require("cookie-parser");
const helmet_1 = require("helmet");
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    (0, jwt_secret_1.getAccessSecret)();
    (0, jwt_secret_1.getRefreshSecret)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const isProd = process.env.NODE_ENV === 'production';
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: isProd
            ? {
                directives: {
                    defaultSrc: ["'none'"],
                    frameAncestors: ["'none'"],
                },
            }
            : false,
        crossOriginResourcePolicy: { policy: 'same-site' },
    }));
    app.setGlobalPrefix('api/v1');
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
    }));
    const allowlist = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || allowlist.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    });
    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log(`API Server is running on: http://localhost:${port}/api/v1`);
    logger.log(`CORS allowlist: ${allowlist.join(', ')}`);
}
bootstrap();
//# sourceMappingURL=main.js.map