-- Demo opcional para desenvolvimento local.
with w as (
  insert into workspaces(name,slug,vertical,status,modules)
  values ('NexOffice Demo','nexoffice-demo','general','active',array['crm','agenda','tasks','erp','collections','documents','service','command-center','agents','growth','usage'])
  on conflict(slug) do update set updated_at=now()
  returning id
), c1 as (
  insert into crm_contacts(workspace_id,kind,name,email,phone,source,tags)
  select id,'company','Almeida & Torres','contato@almeidatorres.example','5513999990001','indicação',array['jurídico'] from w returning id,workspace_id
), c2 as (
  insert into crm_contacts(workspace_id,kind,name,email,phone,source,tags)
  select id,'company','Clínica Horizonte','contato@horizonte.example','5513999990002','site',array['saúde'] from w returning id,workspace_id
)
insert into crm_deals(workspace_id,contact_id,title,stage,value_minor,next_action,source)
select workspace_id,id,'Almeida & Torres','lead',350000,'Primeiro contato','indicação' from c1
union all
select workspace_id,id,'Clínica Horizonte','qualified',590000,'Agendar demonstração','site' from c2;

insert into ledger_entries(workspace_id,direction,category,description,amount_minor,status,due_at)
select id,'income','serviços','Mensalidades e serviços',2840000,'paid',now() from workspaces where slug='nexoffice-demo'
union all
select id,'expense','operação','Custos operacionais',1190000,'paid',now() from workspaces where slug='nexoffice-demo'
union all
select id,'income','serviços','Recebíveis em aberto',870000,'open',now()+interval '7 day' from workspaces where slug='nexoffice-demo';
