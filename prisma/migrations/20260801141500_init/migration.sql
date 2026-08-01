-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `refreshTokenHash` CHAR(64) NOT NULL,
    `userAgent` VARCHAR(1000) NULL,
    `ipAddress` VARCHAR(45) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `auth_sessions_refreshTokenHash_key`(`refreshTokenHash`),
    INDEX `auth_sessions_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `auth_sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `slide_generations` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `title` VARCHAR(500) NULL,
    `provider` VARCHAR(50) NOT NULL,
    `modelId` VARCHAR(255) NOT NULL,
    `requestPayload` JSON NOT NULL,
    `responsePayload` JSON NULL,
    `htmlContent` LONGTEXT NULL,
    `finishReason` VARCHAR(100) NULL,
    `promptTokens` INTEGER NULL,
    `completionTokens` INTEGER NULL,
    `totalTokens` INTEGER NULL,
    `errorCode` VARCHAR(100) NULL,
    `errorMessage` TEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `slide_generations_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `slide_generations_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `slide_generations_provider_modelId_idx`(`provider`, `modelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_request_logs` (
    `id` CHAR(36) NOT NULL,
    `requestId` VARCHAR(100) NOT NULL,
    `userId` CHAR(36) NULL,
    `slideGenerationId` CHAR(36) NULL,
    `method` VARCHAR(10) NOT NULL,
    `path` VARCHAR(2048) NOT NULL,
    `queryParams` JSON NULL,
    `requestHeaders` JSON NULL,
    `requestBody` JSON NULL,
    `statusCode` INTEGER NULL,
    `responseHeaders` JSON NULL,
    `responseBody` JSON NULL,
    `ipAddress` VARCHAR(45) NULL,
    `userAgent` VARCHAR(1000) NULL,
    `durationMs` INTEGER NULL,
    `errorCode` VARCHAR(100) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `api_request_logs_requestId_key`(`requestId`),
    INDEX `api_request_logs_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `api_request_logs_slideGenerationId_idx`(`slideGenerationId`),
    INDEX `api_request_logs_method_createdAt_idx`(`method`, `createdAt`),
    INDEX `api_request_logs_statusCode_createdAt_idx`(`statusCode`, `createdAt`),
    INDEX `api_request_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_logs` (
    `id` CHAR(36) NOT NULL,
    `level` ENUM('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL') NOT NULL,
    `message` TEXT NOT NULL,
    `service` VARCHAR(100) NULL,
    `module` VARCHAR(100) NULL,
    `event` VARCHAR(100) NULL,
    `requestId` VARCHAR(100) NULL,
    `userId` CHAR(36) NULL,
    `slideGenerationId` CHAR(36) NULL,
    `context` JSON NULL,
    `errorName` VARCHAR(255) NULL,
    `errorStack` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `system_logs_level_createdAt_idx`(`level`, `createdAt`),
    INDEX `system_logs_requestId_idx`(`requestId`),
    INDEX `system_logs_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `system_logs_slideGenerationId_idx`(`slideGenerationId`),
    INDEX `system_logs_service_createdAt_idx`(`service`, `createdAt`),
    INDEX `system_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slide_generations` ADD CONSTRAINT `slide_generations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_request_logs` ADD CONSTRAINT `api_request_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_request_logs` ADD CONSTRAINT `api_request_logs_slideGenerationId_fkey` FOREIGN KEY (`slideGenerationId`) REFERENCES `slide_generations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_logs` ADD CONSTRAINT `system_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_logs` ADD CONSTRAINT `system_logs_slideGenerationId_fkey` FOREIGN KEY (`slideGenerationId`) REFERENCES `slide_generations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
