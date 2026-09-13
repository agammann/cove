CREATE TABLE `site_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`client_id` text NOT NULL,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_activity` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `site_owners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_connection_binding` ON `site_connections` (`owner_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `site_grants` (
	`connection_id` text NOT NULL,
	`project_id` text NOT NULL,
	`capabilities` text NOT NULL,
	PRIMARY KEY(`connection_id`, `project_id`),
	FOREIGN KEY (`connection_id`) REFERENCES `site_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `site_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `site_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	CONSTRAINT "site_guard_check" CHECK("site_guards"."ok" = 1)
);
--> statement-breakpoint
CREATE TABLE `site_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_measures` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `site_owners`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `site_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_measures_owner` ON `site_measures` (`owner_id`);--> statement-breakpoint
CREATE TABLE `site_owners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`stamp` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`storage_bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `site_owners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_projects_owner` ON `site_projects` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `site_records` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `site_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_records_project` ON `site_records` (`project_id`,`kind`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `site_revision_unique` ON `site_records` (`project_id`,`version`) WHERE "site_records"."kind" = 'revisions';--> statement-breakpoint
CREATE TABLE `site_retries` (
	`actor_id` text NOT NULL,
	`project_id` text NOT NULL,
	`operation` text NOT NULL,
	`request_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`actor_id`, `project_id`, `operation`, `request_key`),
	FOREIGN KEY (`project_id`) REFERENCES `site_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
