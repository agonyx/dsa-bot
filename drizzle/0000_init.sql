CREATE TYPE "public"."action_type" AS ENUM('MELEE', 'RANGED', 'MAGIC');--> statement-breakpoint
CREATE TYPE "public"."combat_state" AS ENUM('SETUP', 'RUNNING', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."combatant_allegiance" AS ENUM('PLAYER_SIDE', 'HOSTILE');--> statement-breakpoint
CREATE TYPE "public"."combatant_type" AS ENUM('PLAYER', 'NPC');--> statement-breakpoint
CREATE TYPE "public"."equipped_slot" AS ENUM('ADAPTIVE', 'OFFENSE', 'DEFENSE');--> statement-breakpoint
CREATE TYPE "public"."equipped_status" AS ENUM('Y', 'N');--> statement-breakpoint
CREATE TYPE "public"."selected_enum" AS ENUM('NO', 'YES');--> statement-breakpoint
CREATE TYPE "public"."weapon_type" AS ENUM('MELEE', 'RANGED');--> statement-breakpoint
CREATE TABLE "action_modifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"action_type" "action_type",
	"prerequisites" jsonb,
	"rules" jsonb,
	CONSTRAINT "action_modifications_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "combat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"dm_user_id" text NOT NULL,
	"message_id" text,
	"state" "combat_state" DEFAULT 'SETUP' NOT NULL,
	"turn_order" text[] DEFAULT '{}'::text[] NOT NULL,
	"current_turn_index" integer DEFAULT 0 NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"combat_log" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combatant_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combatant_id" uuid NOT NULL,
	"condition_type" text NOT NULL,
	"level" integer NOT NULL,
	"source" text,
	"duration_type" text,
	"duration_remaining" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combatant_conditions_combatant_id_condition_type_key" UNIQUE("combatant_id","condition_type")
);
--> statement-breakpoint
CREATE TABLE "combatant_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combatant_id" uuid NOT NULL,
	"status_type" text NOT NULL,
	"source" text,
	"duration_rounds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combatant_statuses_combatant_id_status_type_key" UNIQUE("combatant_id","status_type")
);
--> statement-breakpoint
CREATE TABLE "combatants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" "combatant_type" NOT NULL,
	"allegiance" "combatant_allegiance" NOT NULL,
	"player_id" integer,
	"discord_user_id" text,
	"mob_definition_id" integer,
	"name" text NOT NULL,
	"max_hp" integer NOT NULL,
	"current_hp" integer NOT NULL,
	"initiative_base" integer DEFAULT 0 NOT NULL,
	"initiative_roll" integer,
	"is_active_turn" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"effect" text,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"base_max_hp" integer NOT NULL,
	"base_initiative" integer NOT NULL,
	"base_attack_value" integer NOT NULL,
	"base_parry_value" integer NOT NULL,
	"base_armor_soak" integer NOT NULL,
	"base_damage_tp" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mobs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "player_action_modifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "player_action_modifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"action_modification_id" uuid NOT NULL,
	"ftw" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_talents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "player_talents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"talent_id" integer NOT NULL,
	"ftw" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"discord_id" text NOT NULL,
	"selected" "selected_enum" DEFAULT 'NO' NOT NULL,
	"avatar" text
);
--> statement-breakpoint
CREATE TABLE "rule_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" text NOT NULL,
	"page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"title" text,
	"category" text NOT NULL,
	"resolved_category" text,
	"heading" text,
	"chunk_text" text NOT NULL,
	"char_start" integer,
	"char_end" integer,
	"embedding" vector(1536),
	"embedding_model" text,
	"embedded_at" timestamp with time zone,
	"is_unresolved" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "rule_chunks_chunk_id_unique" UNIQUE("chunk_id"),
	CONSTRAINT "rule_chunks_page_id_version_chunk_index_key" UNIQUE("page_id","version","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "rule_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" text NOT NULL,
	"source_item_id" text,
	"source_url" text NOT NULL,
	"url_hash" text NOT NULL,
	"canonical_slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"resolved_category" text,
	"subcategory" text,
	"page_state" text,
	"is_unresolved" boolean DEFAULT false NOT NULL,
	"resolution_confidence" text,
	"normalized_content" text NOT NULL,
	"content_hash" text NOT NULL,
	"parser_version" text NOT NULL,
	"scraper_version" text NOT NULL,
	"source_snapshot_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_pages_doc_id_unique" UNIQUE("doc_id"),
	CONSTRAINT "rule_pages_source_url_unique" UNIQUE("source_url"),
	CONSTRAINT "rule_pages_canonical_slug_unique" UNIQUE("canonical_slug")
);
--> statement-breakpoint
CREATE TABLE "stats" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"mu" integer DEFAULT 0 NOT NULL,
	"kl" integer DEFAULT 0 NOT NULL,
	"in" integer DEFAULT 0 NOT NULL,
	"ch" integer DEFAULT 0 NOT NULL,
	"ff" integer DEFAULT 0 NOT NULL,
	"ge" integer DEFAULT 0 NOT NULL,
	"ko" integer DEFAULT 0 NOT NULL,
	"kk" integer DEFAULT 0 NOT NULL,
	"le_max" integer DEFAULT 0 NOT NULL,
	"le_current" integer DEFAULT 0 NOT NULL,
	"asp_max" integer DEFAULT 0 NOT NULL,
	"asp_current" integer DEFAULT 0 NOT NULL,
	"kap_max" integer DEFAULT 0 NOT NULL,
	"kap_current" integer DEFAULT 0 NOT NULL,
	"schicksalspunkte_max" integer DEFAULT 0 NOT NULL,
	"schicksalspunkte_current" integer DEFAULT 0 NOT NULL,
	"initiative" integer DEFAULT 0 NOT NULL,
	"ruestungsschutz" integer DEFAULT 0 NOT NULL,
	"ausweichen" integer DEFAULT 0 NOT NULL,
	"attacke_basis" integer DEFAULT 0 NOT NULL,
	"parade_basis" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "talents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"stat1" text NOT NULL,
	"stat2" text NOT NULL,
	"stat3" text NOT NULL,
	CONSTRAINT "talents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "weapons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "weapons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"player_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "weapon_type",
	"tp" text,
	"at" integer DEFAULT 0 NOT NULL,
	"pa" integer DEFAULT 0 NOT NULL,
	"is_equipped" "equipped_status" DEFAULT 'N' NOT NULL,
	"equipped_slot" "equipped_slot"
);
--> statement-breakpoint
ALTER TABLE "combatant_conditions" ADD CONSTRAINT "combatant_conditions_combatant_id_combatants_id_fk" FOREIGN KEY ("combatant_id") REFERENCES "public"."combatants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combatant_statuses" ADD CONSTRAINT "combatant_statuses_combatant_id_combatants_id_fk" FOREIGN KEY ("combatant_id") REFERENCES "public"."combatants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combatants" ADD CONSTRAINT "combatants_session_id_combat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."combat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combatants" ADD CONSTRAINT "combatants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combatants" ADD CONSTRAINT "combatants_mob_definition_id_mobs_id_fk" FOREIGN KEY ("mob_definition_id") REFERENCES "public"."mobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_action_modifications" ADD CONSTRAINT "player_action_modifications_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_action_modifications" ADD CONSTRAINT "player_action_modifications_action_modification_id_action_modifications_id_fk" FOREIGN KEY ("action_modification_id") REFERENCES "public"."action_modifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_talents" ADD CONSTRAINT "player_talents_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_talents" ADD CONSTRAINT "player_talents_talent_id_talents_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_chunks" ADD CONSTRAINT "rule_chunks_page_id_rule_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."rule_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats" ADD CONSTRAINT "stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapons" ADD CONSTRAINT "weapons_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;