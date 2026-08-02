ALTER TABLE `slide_revisions`
  MODIFY `operation` ENUM('GENERATE', 'EDIT', 'UNDO') NOT NULL,
  ADD COLUMN `changedSlideNumbers` JSON NULL AFTER `editRequest`;
