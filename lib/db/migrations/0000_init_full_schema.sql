CREATE TYPE "public"."activity_placement" AS ENUM('autonomy', 'career');--> statement-breakpoint
CREATE TYPE "public"."activity_tag" AS ENUM('autonomy', 'career', 'both');--> statement-breakpoint
CREATE TYPE "public"."attendance_kind" AS ENUM('late', 'early_leave', 'absent_period', 'absent');--> statement-breakpoint
CREATE TYPE "public"."attendance_reason" AS ENUM('illness', 'accepted', 'unaccepted', 'etc');--> statement-breakpoint
CREATE TYPE "public"."calendar_source" AS ENUM('neis', 'manual', 'personal', 'task');--> statement-breakpoint
CREATE TYPE "public"."cca_area" AS ENUM('autonomy', 'club', 'career', 'volunteer');--> statement-breakpoint
CREATE TYPE "public"."counsel_target" AS ENUM('student', 'parent');--> statement-breakpoint
CREATE TYPE "public"."creative_area" AS ENUM('autonomy', 'club', 'career');--> statement-breakpoint
CREATE TYPE "public"."eval_method" AS ENUM('rel_abs', 'abs', 'ach3');--> statement-breakpoint
CREATE TYPE "public"."link_status" AS ENUM('auto_linked', 'pending', 'new_person');--> statement-breakpoint
CREATE TYPE "public"."report_tier" AS ENUM('normal', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('planned', 'done', 'not_held');--> statement-breakpoint
CREATE TYPE "public"."special_note_source" AS ENUM('cowork', 'api');--> statement-breakpoint
CREATE TYPE "public"."special_note_status" AS ENUM('draft', 'editing', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."special_note_type" AS ENUM('autonomy', 'club', 'career', 'subject', 'behavior');--> statement-breakpoint
CREATE TYPE "public"."timetable_source" AS ENUM('comcigan', 'manual');--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"school_year" integer NOT NULL,
	"sid" char(5) NOT NULL,
	"grade" integer NOT NULL,
	"class_no" integer NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"parent_name" text,
	"parent_phone" text,
	"career" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_student_years_owner_year_sid" UNIQUE("owner_id","school_year","sid"),
	CONSTRAINT "ck_student_years_sid_format" CHECK ("student_years"."sid" ~ '^[0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "year_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"new_student_year_id" uuid NOT NULL,
	"candidate_person_id" uuid,
	"link_status" "link_status" NOT NULL,
	"reason" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "session_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_class_sessions" UNIQUE("section_id","date")
);
--> statement-breakpoint
CREATE TABLE "course_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"label" text NOT NULL,
	"room" text,
	"exam_boundary_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_enrollments" UNIQUE("section_id","student_year_id")
);
--> statement-breakpoint
CREATE TABLE "homeroom_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"school_year" integer NOT NULL,
	"grade" integer NOT NULL,
	"class_no" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_homeroom_classes" UNIQUE("owner_id","school_year","grade","class_no")
);
--> statement-breakpoint
CREATE TABLE "homeroom_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"homeroom_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_homeroom_members" UNIQUE("homeroom_id","student_year_id")
);
--> statement-breakpoint
CREATE TABLE "performance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weight" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"school_year" integer NOT NULL,
	"curriculum_category" text,
	"eval_method" "eval_method",
	"jipil_mid_weight" numeric,
	"jipil_final_weight" numeric,
	"achievement_cuts" jsonb,
	"exam_boundary_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"period" integer NOT NULL,
	"room" text,
	"source" timetable_source DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"role_name" text NOT NULL,
	"role_desc" text,
	"service_time_flag" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_activity_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"area" "creative_area" NOT NULL,
	"activity_date" date NOT NULL,
	"common_body" text,
	"club_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_activity_student_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homeroom_behavior_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"noted_on" date NOT NULL,
	"body" text NOT NULL,
	"keywords" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"name" text NOT NULL,
	"score" numeric,
	"prose" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_note_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"type" "special_note_type" NOT NULL,
	"subject_id" uuid,
	"content" text DEFAULT '' NOT NULL,
	"byte_count" integer DEFAULT 0 NOT NULL,
	"byte_limit" integer NOT NULL,
	"status" "special_note_status" DEFAULT 'draft' NOT NULL,
	"source" "special_note_source" DEFAULT 'cowork' NOT NULL,
	"model" text,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_activity_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"tag" "activity_tag" NOT NULL,
	"placement" "activity_placement",
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_extra_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"subject_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"section_id" uuid,
	"session_id" uuid,
	"observed_on" date NOT NULL,
	"body" text NOT NULL,
	"keywords" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"date" date NOT NULL,
	"reason" "attendance_reason" NOT NULL,
	"kind" "attendance_kind" NOT NULL,
	"report_required" boolean DEFAULT false NOT NULL,
	"report_submitted" boolean DEFAULT false NOT NULL,
	"note_field" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_trip_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"trip_date" date NOT NULL,
	"post_report_submitted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"attendance_record_id" uuid,
	"field_trip_id" uuid,
	"deadline_date" date,
	"last_tier" "report_tier" DEFAULT 'normal' NOT NULL,
	"last_computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_report_tracking_exactly_one" CHECK (num_nonnulls("report_tracking"."attendance_record_id", "report_tracking"."field_trip_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"ref" text,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" numeric NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"area" text NOT NULL,
	"planned_amount" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"date" date NOT NULL,
	"source" "calendar_source" NOT NULL,
	"cca_area" "cca_area",
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"desired_career" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_club_members" UNIQUE("club_id","student_year_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counseling_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"date" date NOT NULL,
	"target" "counsel_target" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"rank" integer,
	"grade_5" integer,
	"achievement" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"date" date NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_meal_cache" UNIQUE("owner_id","date")
);
--> statement-breakpoint
CREATE TABLE "public_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"student_year_id" uuid NOT NULL,
	"token" text DEFAULT encode(gen_random_bytes(16), 'hex') NOT NULL,
	"common_payload" jsonb,
	"teacher_message" text,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_pages_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "school_day_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_school_day" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_school_day_calendar" UNIQUE("owner_id","date")
);
--> statement-breakpoint
CREATE TABLE "setup_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_setup_state" UNIQUE("owner_id","feature")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"deadline" date,
	"progress" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text,
	"subjects_taught" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_profile_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
ALTER TABLE "student_years" ADD CONSTRAINT "student_years_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_links" ADD CONSTRAINT "year_links_new_student_year_id_student_years_id_fk" FOREIGN KEY ("new_student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_links" ADD CONSTRAINT "year_links_candidate_person_id_persons_id_fk" FOREIGN KEY ("candidate_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homeroom_members" ADD CONSTRAINT "homeroom_members_homeroom_id_homeroom_classes_id_fk" FOREIGN KEY ("homeroom_id") REFERENCES "public"."homeroom_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homeroom_members" ADD CONSTRAINT "homeroom_members_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_items" ADD CONSTRAINT "performance_items_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_roles" ADD CONSTRAINT "class_roles_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_activity_records" ADD CONSTRAINT "creative_activity_records_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_activity_student_overrides" ADD CONSTRAINT "creative_activity_student_overrides_record_id_creative_activity_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."creative_activity_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_activity_student_overrides" ADD CONSTRAINT "creative_activity_student_overrides_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homeroom_behavior_notes" ADD CONSTRAINT "homeroom_behavior_notes_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_assessments" ADD CONSTRAINT "performance_assessments_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_assessments" ADD CONSTRAINT "performance_assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_note_drafts" ADD CONSTRAINT "special_note_drafts_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_note_drafts" ADD CONSTRAINT "special_note_drafts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_activity_entries" ADD CONSTRAINT "student_activity_entries_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_extra_notes" ADD CONSTRAINT "student_extra_notes_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_extra_notes" ADD CONSTRAINT "student_extra_notes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_observations" ADD CONSTRAINT "subject_observations_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_observations" ADD CONSTRAINT "subject_observations_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."course_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_observations" ADD CONSTRAINT "subject_observations_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_reports" ADD CONSTRAINT "field_trip_reports_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_tracking" ADD CONSTRAINT "report_tracking_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_tracking" ADD CONSTRAINT "report_tracking_field_trip_id_field_trip_reports_id_fk" FOREIGN KEY ("field_trip_id") REFERENCES "public"."field_trip_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_expenses" ADD CONSTRAINT "budget_expenses_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counseling_logs" ADD CONSTRAINT "counseling_logs_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_pages" ADD CONSTRAINT "public_pages_student_year_id_student_years_id_fk" FOREIGN KEY ("student_year_id") REFERENCES "public"."student_years"("id") ON DELETE cascade ON UPDATE no action;