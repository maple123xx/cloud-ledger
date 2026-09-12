CREATE TABLE `ledger_records` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`type` text NOT NULL,
	`cents` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE INDEX `ledger_owner_created` ON `ledger_records` (`owner`,`created_at`);