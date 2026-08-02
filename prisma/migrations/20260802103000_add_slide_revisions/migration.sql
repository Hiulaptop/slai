-- AlterTable
ALTER TABLE `slide_generations`
    ADD COLUMN `approvedOutline` JSON NULL,
    ADD COLUMN `currentRevisionNumber` INTEGER NULL,
    ADD COLUMN `nextRevisionNumber` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `slide_revisions` (
    `id` CHAR(36) NOT NULL,
    `slideGenerationId` CHAR(36) NOT NULL,
    `revisionNumber` INTEGER NOT NULL,
    `parentRevisionNumber` INTEGER NULL,
    `operation` ENUM('GENERATE', 'EDIT') NOT NULL,
    `editRequest` JSON NULL,
    `htmlContent` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `slide_revisions_slideGenerationId_revisionNumber_key`(`slideGenerationId`, `revisionNumber`),
    INDEX `slide_revisions_slideGenerationId_parentRevisionNumber_idx`(`slideGenerationId`, `parentRevisionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `slide_revisions` ADD CONSTRAINT `slide_revisions_slideGenerationId_fkey` FOREIGN KEY (`slideGenerationId`) REFERENCES `slide_generations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
