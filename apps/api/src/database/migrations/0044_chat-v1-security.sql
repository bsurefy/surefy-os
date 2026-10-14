-- Chat V1: custom SQL (runs as surefy_owner). FORCE RLS on the shares and the prompt library, and
-- the link from agent answers to their runs (docs: plan/database/chat.md, §4, §8–10).
alter table chat_shares force row level security;
--> statement-breakpoint
alter table prompts force row level security;
--> statement-breakpoint
alter table prompt_shares force row level security;
--> statement-breakpoint
-- not in the Drizzle schema: agent_runs references chats, and the table files do not import in a cycle
alter table chat_messages
  add constraint chat_messages_agent_run_id_fkey foreign key (agent_run_id)
  references agent_runs (id) on delete set null;
