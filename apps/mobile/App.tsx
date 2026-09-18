import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  api,
  clearSession,
  getSession,
  hydrateSession,
  patch,
  post,
  setSession,
  setWorkspace,
  type Workspace,
} from './src/api';

type Tab = 'today' | 'clients' | 'money' | 'team' | 'more';
type QuickType = 'contact' | 'deal' | 'task' | 'income' | 'expense';
type AgentRole = 'secretary' | 'service' | 'crm' | 'erp' | 'collections' | 'controller' | 'documents' | 'growth';

type Dashboard = {
  workspace?: { id: string; name: string; role: string };
  crm?: { deals: number; open_deals: number; open_pipeline_minor: number; won_month: number };
  finance?: { income_paid_minor: number; expense_paid_minor: number; receivable_minor: number; payable_minor: number; overdue_count: number };
  command?: { open_actions: number };
  approvals?: { pending_approvals: number };
  tasks?: { due_tasks: number };
  appointments?: { today_appointments: number };
};

type ActionItem = { id: string; agent_role: string; title: string; summary: string; priority: string; autonomy: string; status: string };
type Contact = { id: string; kind: string; name: string; email?: string; phone?: string; company_name?: string; source?: string; tags?: string[] };
type Ledger = { id: string; direction: 'income' | 'expense'; category: string; description: string; amount_minor: number | string; status: string; due_at?: string; paid_at?: string; contact_name?: string };
type Task = { id: string; title: string; description?: string; status: string; priority: string; due_at?: string; contact_name?: string };
type Appointment = { id: string; title: string; status: string; starts_at: string; ends_at?: string; contact_name?: string };
type MeResponse = { user: { id: string; name: string; email: string }; workspaces: Workspace[] };
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Agent = { role: AgentRole; name: string; title: string; initial: string };

const agents: Agent[] = [
  { role: 'secretary', name: 'Sofia', title: 'Secretária', initial: 'O que eu preciso resolver hoje?' },
  { role: 'crm', name: 'Clara', title: 'CRM', initial: 'Quais clientes e oportunidades precisam de atenção?' },
  { role: 'collections', name: 'Theo', title: 'Cobrança', initial: 'Quem está me devendo e o que devo priorizar?' },
  { role: 'controller', name: 'Theo', title: 'Controller', initial: 'Faça uma leitura simples da situação financeira.' },
  { role: 'erp', name: 'Nico', title: 'Operação', initial: 'Resuma os pontos operacionais mais importantes agora.' },
  { role: 'service', name: 'Alex', title: 'Atendimento', initial: 'O que precisa de atenção no atendimento?' },
  { role: 'documents', name: 'Dora', title: 'Documentos', initial: 'Quais documentos precisam de atenção?' },
  { role: 'growth', name: 'Maya', title: 'Growth', initial: 'Que oportunidade de crescimento merece atenção agora?' },
];

const money = (minor: unknown = 0) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(minor || 0) / 100);

const date = (value?: string) => {
  if (!value) return 'Sem prazo';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<MeResponse['user'] | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tab, setTab] = useState<Tab>('today');
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);

  const activeWorkspace = workspaces.find((item) => item.id === getSession().workspaceId) || workspaces[0];

  const refresh = useCallback(async () => {
    if (!getSession().token || !getSession().workspaceId) return;
    setError('');
    try {
      const [d, a, c, l, t, ap] = await Promise.all([
        api<Dashboard>('/v1/dashboard'),
        api<ActionItem[]>('/v1/command/actions'),
        api<Contact[]>('/v1/crm/contacts'),
        api<Ledger[]>('/v1/ledger'),
        api<Task[]>('/v1/tasks'),
        api<Appointment[]>('/v1/appointments'),
      ]);
      setDashboard(d);
      setActions(a);
      setContacts(c);
      setLedger(l);
      setTasks(t);
      setAppointments(ap);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        await clearSession();
        setUser(null);
        setWorkspaces([]);
      } else {
        setError(err.message || 'Não foi possível atualizar o NexOffice.');
      }
    }
  }, []);

  const bootstrap = useCallback(async () => {
    const me = await api<MeResponse>('/v1/auth/me');
    setUser(me.user);
    setWorkspaces(me.workspaces || []);
    if (!getSession().workspaceId && me.workspaces?.[0]) await setWorkspace(me.workspaces[0].id);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      try {
        const session = await hydrateSession();
        if (session.token) await bootstrap();
      } catch {
        await clearSession();
      } finally {
        setBooting(false);
      }
    })();
  }, [bootstrap]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function decide(actionId: string, decision: 'approved' | 'rejected' | 'dismissed') {
    try {
      await post(`/v1/command/actions/${actionId}/decision`, { decision });
      await refresh();
    } catch (e) {
      Alert.alert('Não foi possível concluir', (e as Error).message);
    }
  }

  async function markPaid(id: string) {
    Alert.alert('Confirmar recebimento/pagamento', 'Marcar este lançamento como pago?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: () => void (async () => {
          try {
            await patch(`/v1/ledger/${id}`, { status: 'paid' });
            await refresh();
          } catch (e) {
            Alert.alert('Não foi possível atualizar', (e as Error).message);
          }
        })(),
      },
    ]);
  }

  async function switchWorkspace(id: string) {
    await setWorkspace(id);
    await refresh();
    setTab('today');
  }

  async function logout() {
    try { await post('/v1/auth/logout', {}); } catch {}
    await clearSession();
    setUser(null);
    setWorkspaces([]);
    setDashboard({});
  }

  if (booting) {
    return <View style={styles.splash}><View style={styles.logo}><Text style={styles.logoText}>N</Text></View><Text style={styles.splashTitle}>NexOffice</Text><ActivityIndicator style={{ marginTop: 18 }} /></View>;
  }

  if (!user) {
    return <AuthScreen onDone={async (token, workspaceId) => { await setSession(token, workspaceId); await bootstrap(); }} />;
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F5EF" />
      <View style={styles.topbar}>
        <View>
          <Text style={styles.eyebrow}>NEXOFFICE</Text>
          <Text style={styles.workspaceName}>{activeWorkspace?.name || 'Seu negócio'}</Text>
        </View>
        <View style={styles.liveChip}><View style={styles.liveDot} /><Text style={styles.liveText}>ao vivo</Text></View>
      </View>
      {error ? <Pressable style={styles.errorBanner} onPress={() => setError('')}><Text style={styles.errorText}>{error}</Text><Text>×</Text></Pressable> : null}

      <View style={styles.body}>
        {tab === 'today' && <TodayScreen userName={user.name} dashboard={dashboard} actions={actions} tasks={tasks} appointments={appointments} refreshing={refreshing} onRefresh={onRefresh} onDecision={decide} onTeam={() => setTab('team')} />}
        {tab === 'clients' && <ClientsScreen contacts={contacts} dashboard={dashboard} refreshing={refreshing} onRefresh={onRefresh} onAdd={() => setQuickOpen(true)} />}
        {tab === 'money' && <MoneyScreen dashboard={dashboard} ledger={ledger} refreshing={refreshing} onRefresh={onRefresh} onPaid={markPaid} onAdd={() => setQuickOpen(true)} />}
        {tab === 'team' && <TeamScreen actions={actions} refreshing={refreshing} onRefresh={onRefresh} onDecision={decide} />}
        {tab === 'more' && <MoreScreen user={user} workspaces={workspaces} activeWorkspaceId={activeWorkspace?.id || ''} onSwitch={switchWorkspace} onLogout={logout} />}
      </View>

      <View style={styles.tabbar}>
        <TabButton active={tab === 'today'} icon="⌂" label="Hoje" onPress={() => setTab('today')} />
        <TabButton active={tab === 'clients'} icon="◎" label="Clientes" onPress={() => setTab('clients')} />
        <View style={{ width: 66 }} />
        <TabButton active={tab === 'money'} icon="R$" label="Dinheiro" onPress={() => setTab('money')} />
        <TabButton active={tab === 'team'} icon="✦" label="Equipe" onPress={() => setTab('team')} />
        <TabButton active={tab === 'more'} icon="•••" label="Mais" onPress={() => setTab('more')} />
      </View>
      <Pressable style={styles.fab} onPress={() => setQuickOpen(true)}><Text style={styles.fabText}>＋</Text></Pressable>
      <QuickCreate open={quickOpen} contacts={contacts} onClose={() => setQuickOpen(false)} onCreated={async () => { setQuickOpen(false); await refresh(); }} />
    </SafeAreaView>
  );
}

function AuthScreen({ onDone }: { onDone: (token: string, workspaceId?: string) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!email.trim() || !password) return;
    setBusy(true); setError('');
    try {
      if (mode === 'login') {
        const result = await post<{ token: string }>('/v1/auth/login', { email: email.trim(), password });
        await onDone(result.token);
      } else {
        const result = await post<{ token: string; workspace?: { id: string } }>('/v1/auth/register', {
          name: name.trim(), businessName: businessName.trim(), email: email.trim(), password, vertical: 'general',
        });
        await onDone(result.token, result.workspace?.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.authPage}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authWrap}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.authScroll}>
          <View style={styles.logo}><Text style={styles.logoText}>N</Text></View>
          <Text style={styles.authTitle}>NexOffice</Text>
          <Text style={styles.authSubtitle}>Sua empresa na palma da mão.</Text>
          <View style={styles.authCard}>
            <Text style={styles.eyebrow}>{mode === 'login' ? 'ENTRAR' : 'COMEÇAR'}</Text>
            <Text style={styles.sectionTitle}>{mode === 'login' ? 'Acesse seu negócio' : 'Crie seu NexOffice'}</Text>
            {mode === 'register' ? <>
              <Input label="Seu nome" value={name} onChangeText={setName} placeholder="Nome completo" />
              <Input label="Nome do negócio" value={businessName} onChangeText={setBusinessName} placeholder="Minha empresa" />
            </> : null}
            <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="voce@empresa.com.br" />
            <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <Pressable disabled={busy} style={[styles.primaryButton, busy && { opacity: .6 }]} onPress={() => void submit()}>
              <Text style={styles.primaryButtonText}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar workspace'}</Text>
            </Pressable>
            <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} style={styles.linkButton}>
              <Text style={styles.linkText}>{mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho conta'}</Text>
            </Pressable>
          </View>
          <Text style={styles.authFoot}>CRM · Financeiro · Agenda · Equipe Digital</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TodayScreen({ userName, dashboard, actions, tasks, appointments, refreshing, onRefresh, onDecision, onTeam }: {
  userName: string; dashboard: Dashboard; actions: ActionItem[]; tasks: Task[]; appointments: Appointment[]; refreshing: boolean; onRefresh: () => Promise<void>;
  onDecision: (id: string, decision: 'approved' | 'rejected' | 'dismissed') => Promise<void>; onTeam: () => void;
}) {
  const balance = Number(dashboard.finance?.income_paid_minor || 0) - Number(dashboard.finance?.expense_paid_minor || 0);
  return <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />} contentContainerStyle={styles.screen}>
    <View style={styles.hero}>
      <Text style={styles.heroEyebrow}>BOM DIA, {userName.split(' ')[0]?.toUpperCase()}</Text>
      <Text style={styles.heroTitle}>{actions.length ? `${actions.length} ponto${actions.length === 1 ? '' : 's'} precisa${actions.length === 1 ? '' : 'm'} de você.` : 'Sua empresa está em ordem agora.'}</Text>
      <Text style={styles.heroText}>Em 30 segundos, veja como está o negócio e resolva o que realmente importa.</Text>
      <Pressable style={styles.heroButton} onPress={onTeam}><Text style={styles.heroButtonText}>✦ Perguntar à Equipe Digital</Text></Pressable>
    </View>
    <View style={styles.kpiGrid}>
      <Kpi label="Saldo realizado" value={money(balance)} hint="receitas − despesas" />
      <Kpi label="A receber" value={money(dashboard.finance?.receivable_minor)} hint={`${dashboard.finance?.overdue_count || 0} vencidos`} />
      <Kpi label="Pipeline" value={money(dashboard.crm?.open_pipeline_minor)} hint={`${dashboard.crm?.open_deals || 0} oportunidades`} />
      <Kpi label="Hoje" value={String(dashboard.appointments?.today_appointments || 0)} hint={`${dashboard.tasks?.due_tasks || 0} tarefas próximas`} />
    </View>
    <SectionTitle title="Precisa de você" subtitle="Decisões e pontos priorizados pelo NexOffice" count={actions.length} />
    {actions.length ? actions.slice(0, 6).map((item) => <ActionCard key={item.id} item={item} onDecision={onDecision} />) : <EmptyCard text="Nenhuma ação pendente. Aproveite para olhar clientes, dinheiro ou conversar com a equipe." />}
    <SectionTitle title="Seu dia" subtitle="Agenda e próximos passos" />
    {appointments.slice(0, 3).map((item) => <RowCard key={item.id} title={item.title} meta={`${date(item.starts_at)}${item.contact_name ? ` · ${item.contact_name}` : ''}`} badge="Agenda" />)}
    {tasks.filter((item) => item.status !== 'done' && item.status !== 'cancelled').slice(0, 4).map((item) => <RowCard key={item.id} title={item.title} meta={`${date(item.due_at)}${item.contact_name ? ` · ${item.contact_name}` : ''}`} badge={item.priority === 'critical' ? 'Crítica' : 'Tarefa'} />)}
    {!appointments.length && !tasks.length ? <EmptyCard text="Nada programado por enquanto." /> : null}
  </ScrollView>;
}

function ClientsScreen({ contacts, dashboard, refreshing, onRefresh, onAdd }: { contacts: Contact[]; dashboard: Dashboard; refreshing: boolean; onRefresh: () => Promise<void>; onAdd: () => void }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => contacts.filter((item) => `${item.name} ${item.company_name || ''} ${item.email || ''} ${item.phone || ''}`.toLowerCase().includes(query.toLowerCase())), [contacts, query]);
  return <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />} contentContainerStyle={styles.screen}>
    <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>CLIENTES</Text><Text style={styles.pageTitle}>Relacionamentos</Text></View><Pressable style={styles.smallPrimary} onPress={onAdd}><Text style={styles.smallPrimaryText}>＋ Novo</Text></Pressable></View>
    <View style={styles.inlineStats}><MiniStat label="Contatos" value={String(contacts.length)} /><MiniStat label="Pipeline" value={money(dashboard.crm?.open_pipeline_minor)} /><MiniStat label="Abertas" value={String(dashboard.crm?.open_deals || 0)} /></View>
    <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Buscar cliente, telefone ou e-mail" placeholderTextColor="#8B8B85" />
    {filtered.map((item) => <View key={item.id} style={styles.contactCard}><View style={styles.avatar}><Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.name}</Text>{item.company_name ? <Text style={styles.meta}>{item.company_name}</Text> : null}<Text style={styles.meta}>{item.phone || item.email || 'Sem contato cadastrado'}</Text></View><Text style={styles.chevron}>›</Text></View>)}
    {!filtered.length ? <EmptyCard text={query ? 'Nenhum contato encontrado.' : 'Cadastre seu primeiro cliente pelo botão +.'} /> : null}
  </ScrollView>;
}

function MoneyScreen({ dashboard, ledger, refreshing, onRefresh, onPaid, onAdd }: { dashboard: Dashboard; ledger: Ledger[]; refreshing: boolean; onRefresh: () => Promise<void>; onPaid: (id: string) => void; onAdd: () => void }) {
  const balance = Number(dashboard.finance?.income_paid_minor || 0) - Number(dashboard.finance?.expense_paid_minor || 0);
  return <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />} contentContainerStyle={styles.screen}>
    <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>DINHEIRO</Text><Text style={styles.pageTitle}>Financeiro</Text></View><Pressable style={styles.smallPrimary} onPress={onAdd}><Text style={styles.smallPrimaryText}>＋ Lançar</Text></Pressable></View>
    <View style={styles.balanceCard}><Text style={styles.balanceLabel}>Saldo realizado</Text><Text style={styles.balanceValue}>{money(balance)}</Text><View style={styles.balanceRow}><View><Text style={styles.balanceTiny}>Recebido</Text><Text style={styles.positive}>{money(dashboard.finance?.income_paid_minor)}</Text></View><View><Text style={styles.balanceTiny}>Pago</Text><Text style={styles.negative}>{money(dashboard.finance?.expense_paid_minor)}</Text></View></View></View>
    <View style={styles.inlineStats}><MiniStat label="A receber" value={money(dashboard.finance?.receivable_minor)} /><MiniStat label="A pagar" value={money(dashboard.finance?.payable_minor)} /><MiniStat label="Vencidos" value={String(dashboard.finance?.overdue_count || 0)} /></View>
    <SectionTitle title="Movimentações" subtitle="Últimos lançamentos do negócio" />
    {ledger.slice(0, 40).map((item) => <View key={item.id} style={styles.ledgerCard}><View style={[styles.moneyIcon, item.direction === 'income' ? styles.moneyIn : styles.moneyOut]}><Text>{item.direction === 'income' ? '↓' : '↑'}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.description}</Text><Text style={styles.meta}>{item.category} · {date(item.due_at)}</Text><Text style={styles.meta}>{statusLabel(item.status)}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={item.direction === 'income' ? styles.positive : styles.negative}>{money(item.amount_minor)}</Text>{!['paid', 'cancelled'].includes(item.status) ? <Pressable onPress={() => onPaid(item.id)}><Text style={styles.inlineLink}>Marcar pago</Text></Pressable> : null}</View></View>)}
    {!ledger.length ? <EmptyCard text="Nenhuma movimentação registrada ainda." /> : null}
  </ScrollView>;
}

function TeamScreen({ actions, refreshing, onRefresh, onDecision }: { actions: ActionItem[]; refreshing: boolean; onRefresh: () => Promise<void>; onDecision: (id: string, decision: 'approved' | 'rejected' | 'dismissed') => Promise<void> }) {
  const [role, setRole] = useState<AgentRole>('secretary');
  const [threads, setThreads] = useState<Partial<Record<AgentRole, { conversationId: string; messages: ChatMessage[] }>>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const agent = agents.find((item) => item.role === role)!;
  const thread = threads[role] || { conversationId: '', messages: [] };

  async function send(raw = text) {
    const clean = raw.trim();
    if (!clean || busy) return;
    setBusy(true); setText('');
    const before = threads[role] || { conversationId: '', messages: [] };
    setThreads((current) => ({ ...current, [role]: { ...before, messages: [...before.messages, { role: 'user', content: clean }] } }));
    try {
      const result = await post<{ conversationId: string; message: { content: string } }>('/v1/assistant/chat', { message: clean, conversationId: before.conversationId || null, agentRole: role });
      setThreads((current) => {
        const latest = current[role] || { conversationId: '', messages: [] };
        return { ...current, [role]: { conversationId: result.conversationId, messages: [...latest.messages, { role: 'assistant', content: result.message.content }] } };
      });
    } catch (e) {
      Alert.alert('Equipe Digital indisponível', (e as Error).message);
    } finally { setBusy(false); }
  }

  return <View style={{ flex: 1 }}>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />} contentContainerStyle={[styles.screen, { paddingBottom: 150 }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>EQUIPE DIGITAL</Text><Text style={styles.pageTitle}>Especialistas no contexto do seu negócio</Text><Text style={styles.pageLead}>Pergunte. A equipe usa o contexto real do workspace. Ações sensíveis continuam sujeitas às políticas de aprovação.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentStrip}>
        {agents.map((item) => <Pressable key={item.role} onPress={() => setRole(item.role)} style={[styles.agentChip, role === item.role && styles.agentChipActive]}><View style={[styles.agentAvatar, role === item.role && styles.agentAvatarActive]}><Text style={[styles.agentInitial, role === item.role && { color: '#fff' }]}>{item.name[0]}</Text></View><Text style={[styles.agentName, role === item.role && { color: '#132A22' }]}>{item.name}</Text><Text style={styles.agentTitle}>{item.title}</Text></Pressable>)}
      </ScrollView>
      <View style={styles.chatCard}>
        <View style={styles.chatHeader}><View style={styles.agentAvatarActive}><Text style={[styles.agentInitial, { color: '#fff' }]}>{agent.name[0]}</Text></View><View><Text style={styles.cardTitle}>{agent.name} · {agent.title}</Text><Text style={styles.meta}>Contexto compartilhado · approval-first</Text></View></View>
        {!thread.messages.length ? <Pressable style={styles.promptCard} onPress={() => void send(agent.initial)}><Text style={styles.promptText}>“{agent.initial}”</Text><Text style={styles.inlineLink}>Perguntar agora →</Text></Pressable> : null}
        {thread.messages.map((message, index) => <View key={`${message.role}-${index}`} style={[styles.message, message.role === 'user' ? styles.messageUser : styles.messageAssistant]}><Text style={styles.messageLabel}>{message.role === 'user' ? 'Você' : agent.name}</Text><Text style={styles.messageText}>{message.content}</Text></View>)}
        {busy ? <ActivityIndicator style={{ marginVertical: 10 }} /> : null}
      </View>
      <SectionTitle title="Aguardando decisão" subtitle="Ações preparadas pela operação" count={actions.length} />
      {actions.slice(0, 5).map((item) => <ActionCard key={item.id} item={item} onDecision={onDecision} />)}
    </ScrollView>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90} style={styles.composerWrap}>
      <TextInput style={styles.composer} value={text} onChangeText={setText} placeholder={`Pergunte para ${agent.name}…`} placeholderTextColor="#888" multiline />
      <Pressable style={[styles.sendButton, (!text.trim() || busy) && { opacity: .4 }]} disabled={!text.trim() || busy} onPress={() => void send()}><Text style={styles.sendText}>↑</Text></Pressable>
    </KeyboardAvoidingView>
  </View>;
}

function MoreScreen({ user, workspaces, activeWorkspaceId, onSwitch, onLogout }: { user: MeResponse['user']; workspaces: Workspace[]; activeWorkspaceId: string; onSwitch: (id: string) => Promise<void>; onLogout: () => Promise<void> }) {
  return <ScrollView contentContainerStyle={styles.screen}>
    <Text style={styles.eyebrow}>MAIS</Text><Text style={styles.pageTitle}>Empresa & conta</Text>
    <View style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileInitial}>{user.name[0]?.toUpperCase()}</Text></View><View><Text style={styles.cardTitle}>{user.name}</Text><Text style={styles.meta}>{user.email}</Text></View></View>
    <SectionTitle title="Empresas" subtitle="Troque o workspace ativo" />
    {workspaces.map((item) => <Pressable key={item.id} style={[styles.workspaceCard, item.id === activeWorkspaceId && styles.workspaceCardActive]} onPress={() => void onSwitch(item.id)}><View><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.meta}>{item.role || 'membro'} · {item.plan || 'NexOffice'}</Text></View><Text style={styles.workspaceCheck}>{item.id === activeWorkspaceId ? '✓' : '›'}</Text></Pressable>)}
    <SectionTitle title="Segurança" subtitle="Governança mobile" />
    <View style={styles.safetyCard}><Text style={styles.safetyTitle}>🔒 Controle humano preservado</Text><Text style={styles.safetyText}>O app prepara, organiza e permite aprovar decisões. Efeitos externos continuam obedecendo às políticas e aos gates do NexOffice.</Text></View>
    <Pressable style={styles.logoutButton} onPress={() => void onLogout()}><Text style={styles.logoutText}>Sair do NexOffice</Text></Pressable>
    <Text style={styles.version}>NexOffice Mobile · MVP 0.1</Text>
  </ScrollView>;
}

function QuickCreate({ open, contacts, onClose, onCreated }: { open: boolean; contacts: Contact[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [type, setType] = useState<QuickType | null>(null);
  const [title, setTitle] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [amount, setAmount] = useState(''); const [busy, setBusy] = useState(false);
  function reset() { setType(null); setTitle(''); setEmail(''); setPhone(''); setAmount(''); }
  function close() { reset(); onClose(); }
  async function save() {
    if (!type || !title.trim()) return;
    setBusy(true);
    try {
      if (type === 'contact') await post('/v1/crm/contacts', { kind: 'person', name: title.trim(), email: email.trim() || null, phone: phone.trim() || null, tags: [] });
      if (type === 'deal') await post('/v1/crm/deals', { contactId: null, title: title.trim(), stage: 'lead', valueMinor: toMinor(amount), nextAction: null, source: 'mobile' });
      if (type === 'task') await post('/v1/tasks', { title: title.trim(), description: null, priority: 'normal', dueAt: null, contactId: null });
      if (type === 'income' || type === 'expense') await post('/v1/ledger', { contactId: null, accountId: null, direction: type, category: 'geral', description: title.trim(), amountMinor: toMinor(amount), status: 'open', dueAt: null });
      reset(); await onCreated();
    } catch (e) { Alert.alert('Não foi possível salvar', (e as Error).message); }
    finally { setBusy(false); }
  }
  return <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalShade}>
      <View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sectionHead}><View><Text style={styles.eyebrow}>AÇÃO RÁPIDA</Text><Text style={styles.sectionTitle}>{type ? quickTitle(type) : 'O que você quer registrar?'}</Text></View><Pressable onPress={close}><Text style={styles.closeText}>×</Text></Pressable></View>
        {!type ? <View style={styles.quickGrid}>
          <QuickOption icon="◎" label="Contato" onPress={() => setType('contact')} /><QuickOption icon="◇" label="Oportunidade" onPress={() => setType('deal')} /><QuickOption icon="✓" label="Tarefa" onPress={() => setType('task')} /><QuickOption icon="↓" label="Receita" onPress={() => setType('income')} /><QuickOption icon="↑" label="Despesa" onPress={() => setType('expense')} />
        </View> : <>
          <Input label={type === 'contact' ? 'Nome' : type === 'task' ? 'Tarefa' : type === 'deal' ? 'Oportunidade' : 'Descrição'} value={title} onChangeText={setTitle} autoFocus placeholder="Digite aqui" />
          {type === 'contact' ? <><Input label="Telefone / WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Input label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></> : null}
          {['deal', 'income', 'expense'].includes(type) ? <Input label="Valor (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" /> : null}
          {type === 'deal' && contacts.length ? <Text style={styles.formHint}>Você poderá vincular o contato e completar o próximo passo no CRM.</Text> : null}
          <View style={styles.sheetActions}><Pressable style={styles.secondaryButton} onPress={() => setType(null)}><Text>Voltar</Text></Pressable><Pressable style={[styles.primaryButton, { flex: 1 }, busy && { opacity: .5 }]} disabled={busy || !title.trim()} onPress={() => void save()}><Text style={styles.primaryButtonText}>{busy ? 'Salvando…' : 'Salvar'}</Text></Pressable></View>
        </>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function ActionCard({ item, onDecision }: { item: ActionItem; onDecision: (id: string, decision: 'approved' | 'rejected' | 'dismissed') => Promise<void> }) {
  return <View style={styles.actionCard}><View style={styles.actionTop}><View style={[styles.priorityDot, item.priority === 'critical' && { backgroundColor: '#B13A2F' }, item.priority === 'high' && { backgroundColor: '#C67A21' }]} /><Text style={styles.actionAgent}>{agentName(item.agent_role)}</Text><Text style={styles.actionPriority}>{item.priority}</Text></View><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.actionSummary}>{item.summary}</Text><View style={styles.actionButtons}><Pressable style={styles.rejectButton} onPress={() => void onDecision(item.id, 'rejected')}><Text style={styles.rejectText}>Recusar</Text></Pressable><Pressable style={styles.approveButton} onPress={() => void onDecision(item.id, 'approved')}><Text style={styles.approveText}>Aprovar</Text></Pressable></View></View>;
}

function TabButton({ active, icon, label, onPress }: { active: boolean; icon: string; label: string; onPress: () => void }) {
  return <Pressable style={styles.tabButton} onPress={onPress}><Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>;
}
function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) { return <View style={styles.kpi}><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiHint}>{hint}</Text></View>; }
function MiniStat({ label, value }: { label: string; value: string }) { return <View style={styles.miniStat}><Text style={styles.miniLabel}>{label}</Text><Text style={styles.miniValue} numberOfLines={1}>{value}</Text></View>; }
function SectionTitle({ title, subtitle, count }: { title: string; subtitle: string; count?: number }) { return <View style={styles.sectionTitleWrap}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>{typeof count === 'number' ? <View style={styles.countBadge}><Text style={styles.countText}>{count}</Text></View> : null}</View>; }
function RowCard({ title, meta, badge }: { title: string; meta: string; badge: string }) { return <View style={styles.rowCard}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.meta}>{meta}</Text></View><Text style={styles.rowBadge}>{badge}</Text></View>; }
function EmptyCard({ text }: { text: string }) { return <View style={styles.emptyCard}><Text style={styles.emptyText}>{text}</Text></View>; }
function QuickOption({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) { return <Pressable style={styles.quickOption} onPress={onPress}><Text style={styles.quickIcon}>{icon}</Text><Text style={styles.quickLabel}>{label}</Text></Pressable>; }
function Input(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, ...rest } = props; return <View style={styles.inputWrap}><Text style={styles.inputLabel}>{label}</Text><TextInput {...rest} style={[styles.input, rest.multiline && { minHeight: 88, textAlignVertical: 'top' }]} placeholderTextColor="#99968E" /></View>; }

function quickTitle(type: QuickType) { return ({ contact: 'Novo contato', deal: 'Nova oportunidade', task: 'Nova tarefa', income: 'Nova receita', expense: 'Nova despesa' } as Record<QuickType, string>)[type]; }
function toMinor(value: string) { const normalized = value.replace(/\./g, '').replace(',', '.'); return Math.max(0, Math.round(Number(normalized || 0) * 100)); }
function agentName(role: string) { return ({ secretary: 'Sofia', service: 'Alex', crm: 'Clara', erp: 'Nico', collections: 'Theo', controller: 'Theo', documents: 'Dora', growth: 'Maya' } as Record<string, string>)[role] || 'NexOffice'; }
function statusLabel(status: string) { return ({ open: 'Em aberto', planned: 'Planejado', paid: 'Pago', overdue: 'Vencido', cancelled: 'Cancelado' } as Record<string, string>)[status] || status; }

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#F7F5EF' }, body: { flex: 1 }, splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F5EF' }, splashTitle: { fontSize: 26, fontWeight: '800', color: '#132A22', marginTop: 12 },
  logo: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#153E34', alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontWeight: '900', fontSize: 30 },
  topbar: { minHeight: 67, paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDD9CF', backgroundColor: '#F7F5EF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { fontSize: 10, letterSpacing: 1.5, color: '#6F776E', fontWeight: '800' }, workspaceName: { fontSize: 18, fontWeight: '800', color: '#17251F', marginTop: 2 }, liveChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E6EFEA', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2B7B5F', marginRight: 6 }, liveText: { fontSize: 11, color: '#2B5F4D', fontWeight: '700' },
  errorBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 14, marginTop: 8, padding: 11, borderRadius: 12, backgroundColor: '#FCE9E6' }, errorText: { flex: 1, color: '#8B3028', fontSize: 12, marginRight: 10 },
  screen: { padding: 16, paddingBottom: 115 }, hero: { backgroundColor: '#153E34', borderRadius: 26, padding: 22, marginBottom: 14 }, heroEyebrow: { color: '#BBD5C8', fontSize: 10, letterSpacing: 1.4, fontWeight: '800' }, heroTitle: { color: '#fff', fontSize: 28, lineHeight: 33, fontWeight: '900', marginTop: 9 }, heroText: { color: '#DCE9E3', fontSize: 14, lineHeight: 20, marginTop: 9 }, heroButton: { alignSelf: 'flex-start', backgroundColor: '#F2C96D', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginTop: 18 }, heroButtonText: { color: '#20342D', fontWeight: '800', fontSize: 12 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }, kpi: { width: '48%', flexGrow: 1, minHeight: 112, backgroundColor: '#fff', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: '#E8E3D9' }, kpiLabel: { fontSize: 11, color: '#737871', fontWeight: '700' }, kpiValue: { fontSize: 20, fontWeight: '900', color: '#142A22', marginTop: 8 }, kpiHint: { fontSize: 11, color: '#8B8E88', marginTop: 5 },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 10 }, sectionTitle: { fontSize: 18, fontWeight: '900', color: '#192A24' }, sectionSubtitle: { fontSize: 12, color: '#777B75', marginTop: 2 }, countBadge: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: '#E8E4DA', alignItems: 'center', justifyContent: 'center' }, countText: { fontWeight: '800', color: '#35463E' },
  actionCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E8E3D9', marginBottom: 10 }, actionTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, priorityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4C8A70', marginRight: 7 }, actionAgent: { fontSize: 11, fontWeight: '800', color: '#436055' }, actionPriority: { marginLeft: 'auto', textTransform: 'uppercase', fontSize: 9, color: '#8A8A84', fontWeight: '800' }, cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800', color: '#1B2A25' }, actionSummary: { fontSize: 13, lineHeight: 19, color: '#666D68', marginTop: 6 }, actionButtons: { flexDirection: 'row', gap: 8, marginTop: 14 }, rejectButton: { flex: 1, borderRadius: 11, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#DDD9CF' }, rejectText: { color: '#705B55', fontWeight: '700', fontSize: 12 }, approveButton: { flex: 1, borderRadius: 11, paddingVertical: 10, alignItems: 'center', backgroundColor: '#183F34' }, approveText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  rowCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E8E3D9', flexDirection: 'row', alignItems: 'center', gap: 8 }, meta: { fontSize: 11, color: '#7D817B', marginTop: 3 }, rowBadge: { fontSize: 10, color: '#4B655B', backgroundColor: '#EDF2EF', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, overflow: 'hidden' }, emptyCard: { backgroundColor: '#EEEAE1', borderRadius: 16, padding: 18, marginBottom: 12 }, emptyText: { color: '#71756F', fontSize: 13, lineHeight: 19 },
  tabbar: { height: 76, backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D8D4CA', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: Platform.OS === 'ios' ? 8 : 2, paddingHorizontal: 4 }, tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 48 }, tabIcon: { fontSize: 18, color: '#8B8D88', fontWeight: '700' }, tabLabel: { fontSize: 9, color: '#8B8D88', marginTop: 3, fontWeight: '700' }, tabActive: { color: '#153E34' }, fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 40 : 45, left: '50%', marginLeft: -29, width: 58, height: 58, borderRadius: 29, backgroundColor: '#E8B84E', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: .18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6, borderWidth: 4, borderColor: '#F7F5EF' }, fabText: { fontSize: 31, lineHeight: 32, color: '#20352D', fontWeight: '400' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, pageTitle: { fontSize: 28, fontWeight: '900', color: '#172A23', marginTop: 3 }, pageLead: { color: '#6D746E', lineHeight: 19, fontSize: 13, marginTop: 7, marginBottom: 10 }, smallPrimary: { backgroundColor: '#153E34', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 }, smallPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 11 }, inlineStats: { flexDirection: 'row', gap: 8, marginBottom: 14 }, miniStat: { flex: 1, backgroundColor: '#EEEAE1', borderRadius: 14, padding: 11 }, miniLabel: { fontSize: 9, color: '#777B75', fontWeight: '700' }, miniValue: { fontSize: 13, color: '#1D3029', fontWeight: '900', marginTop: 4 }, search: { height: 46, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2DED5', borderRadius: 14, paddingHorizontal: 14, fontSize: 13, color: '#1D2D27', marginBottom: 12 }, contactCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderRadius: 16, padding: 13, borderWidth: 1, borderColor: '#E8E3D9', marginBottom: 8 }, avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#E2ECE7', alignItems: 'center', justifyContent: 'center' }, avatarText: { fontWeight: '900', color: '#295445' }, chevron: { fontSize: 26, color: '#B0B0AA' },
  balanceCard: { backgroundColor: '#172F27', borderRadius: 24, padding: 20, marginBottom: 12 }, balanceLabel: { color: '#B5C8C0', fontSize: 11, fontWeight: '700' }, balanceValue: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 6 }, balanceRow: { flexDirection: 'row', gap: 35, marginTop: 20 }, balanceTiny: { color: '#A9BBB4', fontSize: 10, marginBottom: 3 }, positive: { color: '#2E805F', fontWeight: '800' }, negative: { color: '#A74A42', fontWeight: '800' }, ledgerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCD8CF' }, moneyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, moneyIn: { backgroundColor: '#E4F0EA' }, moneyOut: { backgroundColor: '#F5E7E5' }, inlineLink: { fontSize: 10, color: '#2F6554', fontWeight: '800', marginTop: 4 },
  agentStrip: { gap: 8, paddingVertical: 10, paddingRight: 10 }, agentChip: { width: 83, padding: 9, borderRadius: 16, backgroundColor: '#EEEAE1', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' }, agentChipActive: { backgroundColor: '#E7EFEA', borderColor: '#B8D0C5' }, agentAvatar: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#DAD8D0', alignItems: 'center', justifyContent: 'center' }, agentAvatarActive: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#153E34', alignItems: 'center', justifyContent: 'center' }, agentInitial: { fontWeight: '900', color: '#516058' }, agentName: { fontSize: 11, fontWeight: '900', color: '#4E5551', marginTop: 5 }, agentTitle: { fontSize: 8, color: '#858984', marginTop: 1 }, chatCard: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E8E3D9', padding: 14, marginTop: 8 }, chatHeader: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0DDD5' }, promptCard: { backgroundColor: '#F0F4F1', borderRadius: 14, padding: 14, marginTop: 12 }, promptText: { fontSize: 13, color: '#31483F', lineHeight: 19, fontWeight: '600' }, message: { maxWidth: '90%', borderRadius: 15, padding: 11, marginTop: 10 }, messageUser: { alignSelf: 'flex-end', backgroundColor: '#153E34' }, messageAssistant: { alignSelf: 'flex-start', backgroundColor: '#EEEAE1' }, messageLabel: { fontSize: 9, fontWeight: '800', color: '#89918C', marginBottom: 4 }, messageText: { fontSize: 13, lineHeight: 19, color: '#27362F' }, composerWrap: { position: 'absolute', left: 10, right: 10, bottom: 8, backgroundColor: '#fff', borderRadius: 19, padding: 7, borderWidth: 1, borderColor: '#DDD9D0', flexDirection: 'row', alignItems: 'flex-end', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 8, elevation: 4 }, composer: { flex: 1, maxHeight: 95, minHeight: 40, paddingHorizontal: 9, paddingVertical: 9, fontSize: 13, color: '#1F2E28' }, sendButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#153E34', alignItems: 'center', justifyContent: 'center' }, sendText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileCard: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 15, marginTop: 15, borderWidth: 1, borderColor: '#E5E1D8' }, profileAvatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#153E34', alignItems: 'center', justifyContent: 'center' }, profileInitial: { color: '#fff', fontSize: 20, fontWeight: '900' }, workspaceCard: { backgroundColor: '#fff', borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E5E1D8', marginBottom: 8 }, workspaceCardActive: { borderColor: '#82A99A', backgroundColor: '#F0F5F2' }, workspaceCheck: { color: '#2E6653', fontWeight: '900', fontSize: 18 }, safetyCard: { backgroundColor: '#E9EFEA', borderRadius: 18, padding: 16 }, safetyTitle: { color: '#25463A', fontWeight: '900', fontSize: 13 }, safetyText: { color: '#53665D', fontSize: 12, lineHeight: 18, marginTop: 6 }, logoutButton: { borderWidth: 1, borderColor: '#D8C3BF', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 25 }, logoutText: { color: '#8A3C34', fontWeight: '800' }, version: { textAlign: 'center', color: '#999991', fontSize: 10, marginTop: 18 },
  authPage: { flex: 1, backgroundColor: '#F7F5EF' }, authWrap: { flex: 1 }, authScroll: { flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }, authTitle: { fontSize: 30, fontWeight: '900', color: '#153E34', marginTop: 12 }, authSubtitle: { color: '#6D766F', fontSize: 14, marginTop: 3, marginBottom: 24 }, authCard: { width: '100%', maxWidth: 430, backgroundColor: '#fff', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#E4E0D7' }, inputWrap: { marginTop: 13 }, inputLabel: { color: '#505A54', fontSize: 11, fontWeight: '800', marginBottom: 5 }, input: { minHeight: 46, borderWidth: 1, borderColor: '#DCD8CF', backgroundColor: '#FCFBF8', borderRadius: 12, paddingHorizontal: 12, fontSize: 14, color: '#1C2A25' }, formError: { marginTop: 12, color: '#A13D34', fontSize: 12 }, primaryButton: { minHeight: 47, backgroundColor: '#153E34', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingHorizontal: 16 }, primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 13 }, linkButton: { alignItems: 'center', padding: 12, marginTop: 3 }, linkText: { color: '#355F50', fontWeight: '800', fontSize: 12 }, authFoot: { color: '#969890', fontSize: 10, marginTop: 18 },
  modalShade: { flex: 1, backgroundColor: 'rgba(15,25,21,.36)', justifyContent: 'flex-end' }, sheet: { backgroundColor: '#F9F7F1', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 22, minHeight: 300 }, sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#D0CCC2', marginBottom: 16 }, closeText: { fontSize: 30, color: '#737771' }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, quickOption: { width: '31%', flexGrow: 1, minHeight: 92, backgroundColor: '#fff', borderRadius: 16, padding: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E1D8' }, quickIcon: { fontSize: 21, color: '#244A3D', fontWeight: '800' }, quickLabel: { fontSize: 11, color: '#34453E', fontWeight: '800', marginTop: 6, textAlign: 'center' }, sheetActions: { flexDirection: 'row', gap: 9, alignItems: 'center' }, secondaryButton: { minHeight: 47, borderWidth: 1, borderColor: '#D8D3CA', borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 16 }, formHint: { color: '#8B8E88', fontSize: 10, lineHeight: 15, marginTop: 8 },
});
