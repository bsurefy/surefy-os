-- Chat: custom SQL (runs as surefy_owner). FORCE RLS on every chat table
-- (docs: plan/database/chat.md, §1–7; conventions-and-security.md, §4).
alter table chat_folders force row level security;
--> statement-breakpoint
alter table chats force row level security;
--> statement-breakpoint
alter table chat_knowledge_bases force row level security;
--> statement-breakpoint
alter table chat_messages force row level security;
--> statement-breakpoint
alter table chat_message_citations force row level security;
--> statement-breakpoint
alter table chat_message_feedback force row level security;
--> statement-breakpoint
alter table chat_attachments force row level security;
