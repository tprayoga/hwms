"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/setup-env.ts'],
        fileParallelism: false,
        pool: 'forks',
        poolOptions: {
            forks: { singleFork: true },
        },
        hookTimeout: 30000,
        testTimeout: 30000,
    },
});
//# sourceMappingURL=vitest.config.js.map