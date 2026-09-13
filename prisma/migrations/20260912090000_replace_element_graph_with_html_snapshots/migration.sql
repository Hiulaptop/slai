-- DropForeignKey
ALTER TABLE `slide_element_children` DROP FOREIGN KEY `slide_element_children_parentElementNodeId_fkey`;

-- DropForeignKey
ALTER TABLE `slide_element_children` DROP FOREIGN KEY `slide_element_children_childElementNodeId_fkey`;

-- DropForeignKey
ALTER TABLE `slide_element_nodes` DROP FOREIGN KEY `slide_element_nodes_slideGenerationId_fkey`;

-- DropForeignKey
ALTER TABLE `slide_snapshot_elements` DROP FOREIGN KEY `slide_snapshot_elements_slideSnapshotId_fkey`;

-- DropForeignKey
ALTER TABLE `slide_snapshot_elements` DROP FOREIGN KEY `slide_snapshot_elements_elementNodeId_fkey`;

-- DropTable
DROP TABLE `slide_snapshot_elements`;

-- DropTable
DROP TABLE `slide_element_children`;

-- DropTable
DROP TABLE `slide_element_nodes`;

-- AlterTable: replace graph-pointer columns (width/height/props) with the
-- slide's own sanitized html/css. Existing rows have no html/css to backfill
-- from a dropped element graph, so this column-swap is destructive for any
-- environment with real structured-graph data - see this change's design.md
-- "Migration Plan": run the one-time html/css backfill (rendering every
-- existing structured revision through the prior renderer) BEFORE applying
-- this migration in any environment with production data, or accept data
-- loss in a throwaway/dev database.
ALTER TABLE `slide_snapshots`
  DROP COLUMN `width`,
  DROP COLUMN `height`,
  DROP COLUMN `props`,
  ADD COLUMN `html` LONGTEXT NOT NULL,
  ADD COLUMN `css` LONGTEXT NOT NULL;
