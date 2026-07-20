# MVP data and operations policy

## Storage

PostgreSQL stores identity, tenant/document index and authorization metadata, structured styles, credential hashes, and audit records. Git is the source-history authority: one private repository per company stores document snapshots at `documents/<document-uuid>/document.md` or `.html`. Git repositories are not directly accessible.

Private object storage holds logos and styles only. It never holds document source, generated HTML, PDFs, or render records. PDFs are rendered in memory only from the current source.

## Retention and deletion

Company archival retains its private Git repository. Purge is out of scope. Do not claim that archival or normal history is deletion. Encrypted backups retain data until their finite retention expires.

## Backup and recovery

Back up PostgreSQL and the private Git volume as one consistent recovery set; restore them together. Include object storage for logos/styles. Encrypt before off-VPS transfer, run daily backups, and perform periodic restore drills. Record the recovery point, migration version, Git/Database consistency result, and last successful full restore.

Garage is a single-node `replication_factor=1` deployment with no redundancy, so off-VPS backup is mandatory. Keep its metadata and object-data volumes together during local incident response; use encrypted logical backups for portable recovery.

## Privacy and logs

Do not log passwords, session cookies, links, MCP tokens, document bodies, commit source, or renderer transcripts. Logs contain only safe operational metadata such as request ID, actor/credential ID, workspace ID, event, status, duration, and error code.
