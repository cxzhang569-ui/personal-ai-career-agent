# Knowledge data

The six files in example/ describe a completely fictional Alex Chen. They are demo data, not the author's résumé.

Default KNOWLEDGE_DIR=knowledge/example. Copy these files to knowledge/local/ and set KNOWLEDGE_DIR=knowledge/local in .env.local for private use. Edit config/profile.ts to match your own candidate locally. Run pnpm ingest after any change.

Private knowledge/local/, knowledge/private/, legacy root Markdown and all generated data indexes are excluded from version control. Do not force-add them. Keep the directory and index together when deploying a private instance; the public Dockerfile intentionally packages example data only.
