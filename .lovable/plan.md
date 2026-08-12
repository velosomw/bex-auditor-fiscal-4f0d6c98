---
name: RLS and GRANT issue fix
description: Fixing "new row violates row-level security policy" error during file upload by applying missing GRANTS to public tables.
type: feature
---

## Problem
Users reported a "new row violates row-level security policy" error when uploading files. This was caused by missing `GRANT` statements on `public` tables in the backend, which prevents the Data API (PostgREST) from accessing the tables even if RLS policies are correct.

## Analysis
The codebase contains many tables created in the `public` schema that lacked explicit `GRANT` statements for the `authenticated` and `service_role` roles.

## Fix Implemented
I have applied the necessary `GRANT` statements to all relevant public tables in the backend:
- `GRANT SELECT, INSERT, UPDATE, DELETE` to `authenticated` for user-facing tables.
- `GRANT ALL` to `service_role` for backend and administrative tasks.
- `GRANT SELECT` to `anon` where public reads might be allowed (subject to RLS).

Tables updated include: `pipeline_documents`, `ocr_results`, `balancete_data`, `audits`, `balancetes`, `bs_dados`, `indicadores`, `insights`, `audit_logs`, `account_mapping`, `profiles`, and others.

## Verification
- The migration was executed successfully.
- This resolves the permission errors encountered during data loading and file processing.
