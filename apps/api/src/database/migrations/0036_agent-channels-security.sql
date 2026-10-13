-- Agent channels: custom SQL (runs as surefy_owner). FORCE RLS (docs: plan/database/agents-and-runs.md,
-- §4). The definer functions that resolve inbound widget, Slack and WhatsApp traffic come with the
-- channel adapters that call them.
alter table agent_channels force row level security;
