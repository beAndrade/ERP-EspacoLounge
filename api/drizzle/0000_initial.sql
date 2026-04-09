CREATE TABLE "atendimentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_atendimento" text NOT NULL,
	"data" date,
	"id_cliente" text NOT NULL,
	"nome_cliente" text,
	"tipo" text,
	"pacote" text,
	"etapa" text,
	"produto" text,
	"servicos" text,
	"tamanho" text,
	"profissional" text,
	"valor" text,
	"valor_manual" text,
	"comissao" text,
	"desconto" text,
	"descricao" text,
	"descricao_manual" text,
	"custo" text,
	"lucro" text
);
--> statement-breakpoint
CREATE TABLE "cabelos" (
	"id" serial PRIMARY KEY NOT NULL,
	"cor" text,
	"tamanho_cm" text,
	"metodo" text,
	"valor_base" text
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id_cliente" text PRIMARY KEY NOT NULL,
	"nome_exibido" text NOT NULL,
	"telefone" text,
	"observacoes" text
);
--> statement-breakpoint
CREATE TABLE "despesas" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" text,
	"tipo" text,
	"categoria" text,
	"descricao" text,
	"valor" text
);
--> statement-breakpoint
CREATE TABLE "folha" (
	"id" serial PRIMARY KEY NOT NULL,
	"profissional" text,
	"mes" text,
	"total_comissao" text,
	"total_pago" text,
	"saldo" text,
	"status" text
);
--> statement-breakpoint
CREATE TABLE "pacotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"pacote" text NOT NULL,
	"preco_pacote" text
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" text,
	"profissional" text,
	"tipo" text,
	"valor" text,
	"mes_ref" text,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" serial PRIMARY KEY NOT NULL,
	"produto" text NOT NULL,
	"categoria" text,
	"custo" text,
	"preco" text,
	"estoque" text,
	"estoque_inicial" text,
	"unidade" text
);
--> statement-breakpoint
CREATE TABLE "regras_mega" (
	"id" serial PRIMARY KEY NOT NULL,
	"pacote" text NOT NULL,
	"etapa" text NOT NULL,
	"valor" text,
	"comissao" text
);
--> statement-breakpoint
CREATE TABLE "servicos" (
	"linha" integer PRIMARY KEY NOT NULL,
	"servico" text,
	"tipo" text,
	"valor_base" text,
	"comissao_fixa" text,
	"comissao_pct" text,
	"preco_curto" text,
	"preco_medio" text,
	"preco_medio_longo" text,
	"preco_longo" text,
	"custo_fixo" text,
	"curto" text,
	"medio" text,
	"m_l" text,
	"longo" text
);
--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_id_cliente_clientes_id_cliente_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id_cliente") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimentos_data_idx" ON "atendimentos" USING btree ("data");--> statement-breakpoint
CREATE INDEX "atendimentos_id_cliente_idx" ON "atendimentos" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX "atendimentos_id_atendimento_idx" ON "atendimentos" USING btree ("id_atendimento");