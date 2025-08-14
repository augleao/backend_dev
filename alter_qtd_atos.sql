-- Script para alterar o campo qtd_atos de integer para varchar
-- para permitir armazenar quantidade com códigos como "1(7802), 117901)"

-- Backup dos dados existentes (opcional, para segurança)
-- CREATE TABLE selos_execucao_servico_backup AS SELECT * FROM selos_execucao_servico;

-- Alterar o tipo do campo qtd_atos de int4 para varchar(256)
ALTER TABLE public.selos_execucao_servico 
ALTER COLUMN qtd_atos TYPE varchar(256) USING qtd_atos::varchar;

-- Verificar a alteração
-- SELECT column_name, data_type, character_maximum_length 
-- FROM information_schema.columns 
-- WHERE table_name = 'selos_execucao_servico' AND column_name = 'qtd_atos';
