-- Limpeza da auditoria de teste XPTO 6 Meses para reprocessamento
DELETE FROM bs_dados WHERE audit_id = '2c987bd2-3c32-4cbb-bc85-6d35dd5e0cbb';
DELETE FROM indicadores WHERE audit_id = '2c987bd2-3c32-4cbb-bc85-6d35dd5e0cbb';
DELETE FROM kanitz_scores WHERE audit_id = '2c987bd2-3c32-4cbb-bc85-6d35dd5e0cbb';
DELETE FROM insights WHERE audit_id = '2c987bd2-3c32-4cbb-bc85-6d35dd5e0cbb';
DELETE FROM balancete_lines WHERE balancete_id IN (SELECT id FROM balancetes WHERE audit_id = '2c987bd2-3c32-4cbb-bc85-6d35dd5e0cbb');
DELETE FROM balancetes WHERE audit_id = '2c987bd2-3c32-4cbb-bc85-6d35dd5e0cbb';
DELETE FROM audits WHERE id = '2c987bd2-3c32-4cbb-bc85-6d35dd5e0cbb';
DELETE FROM audit_reports WHERE company_id = '19be5ba6-0100-434f-ac0f-bd053061fde8';
DELETE FROM audit_documents WHERE company_id = '19be5ba6-0100-434f-ac0f-bd053061fde8';