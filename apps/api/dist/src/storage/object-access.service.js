"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ObjectAccessService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectAccessService = void 0;
const common_1 = require("@nestjs/common");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const storage_service_1 = require("./storage.service");
let ObjectAccessService = class ObjectAccessService {
    static { ObjectAccessService_1 = this; }
    storage;
    logger = new common_1.Logger(ObjectAccessService_1.name);
    static TTL_PRIVATE = 300;
    static TTL_REPORT = 24 * 60 * 60;
    constructor(storage) {
        this.storage = storage;
    }
    isRemote() {
        return this.storage.isRemote();
    }
    async getSignedUrl(bucket, key, ttlSeconds) {
        const client = this.storage.getClient();
        if (!client)
            return null;
        try {
            const cmd = new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key });
            return await (0, s3_request_presigner_1.getSignedUrl)(client, cmd, { expiresIn: ttlSeconds });
        }
        catch (err) {
            this.logger.error(`Failed to presign ${bucket}/${key}: ${err.message}`);
            return null;
        }
    }
};
exports.ObjectAccessService = ObjectAccessService;
exports.ObjectAccessService = ObjectAccessService = ObjectAccessService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [storage_service_1.StorageService])
], ObjectAccessService);
//# sourceMappingURL=object-access.service.js.map