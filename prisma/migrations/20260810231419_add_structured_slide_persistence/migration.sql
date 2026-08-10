-- AlterTable
ALTER TABLE `slide_revisions` ADD COLUMN `animationRegistryVersion` INTEGER NULL,
    MODIFY `htmlContent` LONGTEXT NULL;

-- CreateTable
CREATE TABLE `slide_element_nodes` (
    `id` CHAR(36) NOT NULL,
    `slideGenerationId` CHAR(36) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `schemaVersion` INTEGER NOT NULL,
    `x` DOUBLE NULL,
    `y` DOUBLE NULL,
    `width` DOUBLE NULL,
    `height` DOUBLE NULL,
    `zIndex` INTEGER NULL,
    `props` JSON NOT NULL,
    `animationKey` VARCHAR(100) NULL,
    `animationProps` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `slide_element_nodes_slideGenerationId_type_idx`(`slideGenerationId`, `type`),
    UNIQUE INDEX `slide_element_nodes_slideGenerationId_contentHash_key`(`slideGenerationId`, `contentHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `slide_element_children` (
    `parentElementNodeId` CHAR(36) NOT NULL,
    `childElementNodeId` CHAR(36) NOT NULL,
    `slotKey` VARCHAR(100) NOT NULL,
    `orderIndex` INTEGER NOT NULL,

    INDEX `slide_element_children_childElementNodeId_idx`(`childElementNodeId`),
    UNIQUE INDEX `slide_element_children_parentElementNodeId_orderIndex_key`(`parentElementNodeId`, `orderIndex`),
    PRIMARY KEY (`parentElementNodeId`, `slotKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `slide_snapshots` (
    `id` CHAR(36) NOT NULL,
    `slideGenerationId` CHAR(36) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `width` DOUBLE NOT NULL,
    `height` DOUBLE NOT NULL,
    `props` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `slide_snapshots_slideGenerationId_idx`(`slideGenerationId`),
    UNIQUE INDEX `slide_snapshots_slideGenerationId_contentHash_key`(`slideGenerationId`, `contentHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `slide_snapshot_elements` (
    `slideSnapshotId` CHAR(36) NOT NULL,
    `orderIndex` INTEGER NOT NULL,
    `elementNodeId` CHAR(36) NOT NULL,

    INDEX `slide_snapshot_elements_elementNodeId_idx`(`elementNodeId`),
    PRIMARY KEY (`slideSnapshotId`, `orderIndex`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `slide_revision_slides` (
    `slideRevisionId` CHAR(36) NOT NULL,
    `slideNumber` INTEGER NOT NULL,
    `slideSnapshotId` CHAR(36) NOT NULL,

    INDEX `slide_revision_slides_slideSnapshotId_idx`(`slideSnapshotId`),
    PRIMARY KEY (`slideRevisionId`, `slideNumber`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `slide_element_nodes` ADD CONSTRAINT `slide_element_nodes_slideGenerationId_fkey` FOREIGN KEY (`slideGenerationId`) REFERENCES `slide_generations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slide_element_children` ADD CONSTRAINT `slide_element_children_parentElementNodeId_fkey` FOREIGN KEY (`parentElementNodeId`) REFERENCES `slide_element_nodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slide_element_children` ADD CONSTRAINT `slide_element_children_childElementNodeId_fkey` FOREIGN KEY (`childElementNodeId`) REFERENCES `slide_element_nodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slide_snapshots` ADD CONSTRAINT `slide_snapshots_slideGenerationId_fkey` FOREIGN KEY (`slideGenerationId`) REFERENCES `slide_generations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slide_snapshot_elements` ADD CONSTRAINT `slide_snapshot_elements_slideSnapshotId_fkey` FOREIGN KEY (`slideSnapshotId`) REFERENCES `slide_snapshots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slide_snapshot_elements` ADD CONSTRAINT `slide_snapshot_elements_elementNodeId_fkey` FOREIGN KEY (`elementNodeId`) REFERENCES `slide_element_nodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slide_revision_slides` ADD CONSTRAINT `slide_revision_slides_slideRevisionId_fkey` FOREIGN KEY (`slideRevisionId`) REFERENCES `slide_revisions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slide_revision_slides` ADD CONSTRAINT `slide_revision_slides_slideSnapshotId_fkey` FOREIGN KEY (`slideSnapshotId`) REFERENCES `slide_snapshots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
