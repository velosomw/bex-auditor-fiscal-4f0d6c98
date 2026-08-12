---
name: RLS and GRANT issue fix
description: Fixing "new row violates row-level security policy" error during file upload by applying missing GRANTS to public tables.
type: feature
---

## Problem
Users reported a "new row violates row-level security policy" error when uploading files. This is often caused by missing `GRANT` statements on `public` tables in Supabase, which prevents the Data API (PostgREST) from accessing the tables even if RLS policies are correct.

## Analysis
The codebase contains many tables created in the `public` schema (e.g., `pipeline_documents`, `ocr_results`, `balancete_data`, `audits`, etc.) that lack explicit `GRANT` statements for the `authenticated` and `service_role` roles.

## Proposed Fix
I will create a new migration that applies the necessary `GRANT` statements to all relevant public tables to ensure the backend and frontend can interact with them correctly.

## Steps
1. Identify all public tables missing GRANTS.
2. Create a migration to GRANT SELECT, INSERT, UPDATE, DELETE to `authenticated`.
3. Create a migration to GRANT ALL to `service_role`.
4. Verify the fix by checking the migration output.
