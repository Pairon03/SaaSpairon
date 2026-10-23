import { useState, type FormEvent } from 'react';
import { Plus, Trash2, LoaderCircle, ArrowRight, FileText, Users, Target, CheckSquare } from 'lucide-react';
import type { Client, Deal } from './types';

type FormKind = 'client' | 'deal' | 'proposal' | 'task';
type Item = { description: string; quantity: number; unitPrice: number };
type ResourceFormProps = {
  kind: FormKind;
  initial?: any;
  clients: Client[];
  deals: Deal[];
  onSave: (path: string, data: any, method?: string) => Promise<void>;
  onCancel: () => void;
};
const currency = (amount: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
const localDay = (offset = 0) => {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
};
const icons = { client: Users, deal: Target, proposal: FileText, task: CheckSquare };
const nouns = { client: 'cliente', deal: 'oportunidade', proposal: 'proposta', task: 'tarefa' };
const plural = { client: 'clients', deal: 'deals', proposal: 'proposals', task: 'tasks' };

export function ResourceForm({ kind, initial, clients, deals, onSave, onCancel }: ResourceFormProps) {
  const [values, setValues] = useState<Record<string, any>>({
    name: initial?.name ?? '', company: initial?.company ?? '', email: initial?.email ?? '',
    phone: initial?.phone ?? '', segment: initial?.segment ?? 'Agência', notes: initial?.notes ?? '',
    title: initial?.title ?? '', clientId: initial?.clientId ?? '', dealId: initial?.dealId ?? '',
    amount: initial?.amount ?? '', recurrence: initial?.recurrence ?? 'monthly', stage: initial?.stage ?? 'lead',
    expectedClose: initial?.expectedClose?.slice(0, 10) ?? localDay(14),
    validUntil: initial?.validUntil?.slice(0, 10) ?? localDay(14),
    message: initial?.message ?? 'Olá! Preparamos uma proposta para transformar os próximos resultados da sua empresa. Conte com a gente para dar o próximo passo.',
    status: initial?.status ?? 'sent', dueDate: initial?.dueDate?.slice(0, 10) ?? localDay(1), done: initial?.done ?? false,
  });
  const [items, setItems] = useState<Item[]>(initial?.items?.length ? initial.items.map((item: Item) => ({ ...item })) : [{ description: '', quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = (key: string, value: any) => setValues(current => ({ ...current, [key]: value }));
  const updateItem = (index: number, key: keyof Item, value: string | number) => setItems(current => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const Icon = icons[kind];
  const isLockedProposal = kind === 'proposal' && ['accepted', 'declined'].includes(initial?.status);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || isLockedProposal) return;
    setError('');
    let data: Record<string, any> = {};
    if (kind === 'client') data = { name: values.name.trim(), company: values.company.trim(), email: values.email.trim(), phone: values.phone.trim(), segment: values.segment.trim(), notes: values.notes.trim() };
    if (kind === 'deal') data = { title: values.title.trim(), clientId: values.clientId || null, amount: Number(values.amount), recurrence: values.recurrence, stage: values.stage, expectedClose: values.expectedClose, notes: values.notes.trim() };
    if (kind === 'proposal') {
      if (!items.length || items.some(item => !item.description.trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
        setError('Preencha a descrição, a quantidade e o valor de todos os serviços.');
        return;
      }
      data = { title: values.title.trim(), clientId: values.clientId, dealId: values.dealId || null, items: items.map(item => ({ ...item, description: item.description.trim() })), message: values.message.trim(), validUntil: values.validUntil, status: values.status };
    }
    if (kind === 'task') data = { title: values.title.trim(), dueDate: values.dueDate, done: Boolean(values.done), clientId: values.clientId || null, dealId: values.dealId || null };
    setSaving(true);
    try {
      await onSave(`/api/${plural[kind]}${initial?.id ? `/${initial.id}` : ''}`, data, initial?.id ? 'PATCH' : 'POST');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }
  const clientOptions = clients.map(client => <option key={client.id} value={client.id}>{client.company || client.name}{client.company ? ` · ${client.name}` : ''}</option>);
  const clientField = (required = true) => <label className="field"><span>Cliente{required && ' *'}</span><select value={values.clientId} required={required} onChange={event => setValues(current => ({ ...current, clientId: event.target.value, dealId: '' }))}><option value="">{required ? 'Selecione um cliente' : 'Sem cliente vinculado'}</option>{clientOptions}</select></label>;

  return <form onSubmit={submit} className="resource-form">
    <div className="form-intro"><div className="form-intro-icon"><Icon size={21} /></div><p>{kind === 'client' ? 'Um bom relacionamento começa com os detalhes certos.' : kind === 'deal' ? 'Organize o próximo contrato e acompanhe cada etapa.' : kind === 'proposal' ? 'Transforme seu escopo em uma proposta pronta para compartilhar.' : 'Dê uma data ao próximo passo do seu negócio.'}</p></div>
    {isLockedProposal && <p className="form-error" role="status">Esta proposta já foi respondida e não pode mais ser editada.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <fieldset disabled={saving || isLockedProposal} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="form-grid">
        {kind === 'client' && <>
          <label className="field"><span>Nome do contato *</span><input autoFocus required maxLength={160} value={values.name} placeholder="Ex.: Marina Costa" onChange={event => change('name', event.target.value)} /></label>
          <label className="field"><span>Empresa</span><input maxLength={160} value={values.company} placeholder="Ex.: Studio Aurora" onChange={event => change('company', event.target.value)} /></label>
          <label className="field"><span>E-mail</span><input type="email" maxLength={254} value={values.email} placeholder="contato@empresa.com.br" onChange={event => change('email', event.target.value)} /></label>
          <label className="field"><span>Telefone</span><input type="tel" maxLength={40} value={values.phone} placeholder="(11) 99999-9999" onChange={event => change('phone', event.target.value)} /></label>
          <label className="field full-width"><span>Segmento</span><input maxLength={100} value={values.segment} placeholder="Ex.: Tecnologia, consultoria, agência" onChange={event => change('segment', event.target.value)} /></label>
          <label className="field full-width"><span>Notas sobre o relacionamento</span><textarea rows={3} maxLength={5000} value={values.notes} placeholder="Contexto, objetivos e próximos passos..." onChange={event => change('notes', event.target.value)} /></label>
        </>}
        {kind === 'deal' && <>
          <label className="field full-width"><span>Nome da oportunidade *</span><input autoFocus required maxLength={200} value={values.title} placeholder="Ex.: Gestão de marketing · Studio Aurora" onChange={event => change('title', event.target.value)} /></label>
          {clientField()}
          <label className="field"><span>Etapa</span><select value={values.stage} onChange={event => change('stage', event.target.value)}><option value="lead">Novo contato</option><option value="proposal">Proposta enviada</option><option value="negotiation">Em negociação</option><option value="won">Contrato ganho</option><option value="lost">Não avançou</option></select></label>
          <label className="field"><span>Valor (R$) *</span><input type="number" required min="0" max="1000000000" step="0.01" value={values.amount} placeholder="0,00" onChange={event => change('amount', event.target.value)} /></label>
          <label className="field"><span>Modelo de receita</span><select value={values.recurrence} onChange={event => change('recurrence', event.target.value)}><option value="monthly">Mensal recorrente</option><option value="one_time">Projeto pontual</option></select></label>
          <label className="field full-width"><span>Previsão de fechamento</span><input type="date" value={values.expectedClose} onChange={event => change('expectedClose', event.target.value)} /></label>
          <label className="field full-width"><span>Escopo e observações</span><textarea rows={3} maxLength={5000} value={values.notes} placeholder="O que você precisa saber para fechar este contrato?" onChange={event => change('notes', event.target.value)} /></label>
        </>}
        {kind === 'proposal' && <>
          <label className="field full-width"><span>Título da proposta *</span><input autoFocus required maxLength={200} value={values.title} placeholder="Ex.: Estratégia e gestão de marketing" onChange={event => change('title', event.target.value)} /></label>
          {clientField()}
          <label className="field"><span>Oportunidade vinculada</span><select value={values.dealId} onChange={event => {
            const deal = deals.find(item => String(item.id) === event.target.value);
            setValues(current => ({ ...current, dealId: event.target.value, ...(deal ? { clientId: deal.clientId, title: current.title || deal.title } : {}) }));
          }}><option value="">Sem vínculo</option>{deals.filter(deal => !values.clientId || String(deal.clientId) === String(values.clientId)).map(deal => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</select></label>
          <label className="field"><span>Validade *</span><input type="date" required value={values.validUntil} min={initial?.id ? undefined : localDay()} onChange={event => change('validUntil', event.target.value)} /></label>
          <label className="field"><span>Disponibilidade</span><select value={values.status} onChange={event => change('status', event.target.value)}><option value="sent">Pronta para compartilhar</option><option value="draft">Rascunho privado</option></select></label>
          <div className="field full-width"><span>Serviços da proposta *</span><div className="line-items">{items.map((item, index) => <div className="item-row" key={index}>
            <label className="field"><span>Descrição</span><input aria-label={`Descrição do serviço ${index + 1}`} required maxLength={500} value={item.description} placeholder="Ex.: Gestão de redes sociais" onChange={event => updateItem(index, 'description', event.target.value)} /></label>
            <label className="field"><span>Qtd.</span><input aria-label={`Quantidade do serviço ${index + 1}`} type="number" min="0.01" max="1000000" step="0.01" required value={item.quantity} onChange={event => updateItem(index, 'quantity', Number(event.target.value))} /></label>
            <label className="field"><span>Valor unitário</span><input aria-label={`Valor do serviço ${index + 1}`} type="number" min="0" max="1000000000" step="0.01" required value={item.unitPrice} onChange={event => updateItem(index, 'unitPrice', Number(event.target.value))} /></label>
            <button type="button" className="button ghost icon-button" aria-label={`Remover serviço ${index + 1}`} disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
          </div>)}</div><div className="item-total"><button type="button" className="button ghost" disabled={items.length >= 50} onClick={() => setItems(current => [...current, { description: '', quantity: 1, unitPrice: 0 }])}><Plus size={16} /> Adicionar serviço</button><strong>Total: {currency(items.reduce((total, item) => total + item.quantity * item.unitPrice, 0))}</strong></div></div>
          <label className="field full-width"><span>Mensagem para o cliente</span><textarea rows={3} maxLength={5000} value={values.message} onChange={event => change('message', event.target.value)} /></label>
          <p className="field full-width form-hint">O aceite registra a aprovação comercial. Pagamentos e assinatura digital certificada não estão incluídos.</p>
        </>}
        {kind === 'task' && <>
          <label className="field full-width"><span>Próximo passo *</span><input autoFocus required maxLength={200} value={values.title} placeholder="Ex.: Retomar proposta com a Marina" onChange={event => change('title', event.target.value)} /></label>
          <label className="field"><span>Prazo *</span><input type="date" required value={values.dueDate} onChange={event => change('dueDate', event.target.value)} /></label>
          {clientField(false)}
          <label className="field full-width"><span>Oportunidade relacionada</span><select value={values.dealId} onChange={event => change('dealId', event.target.value)}><option value="">Sem oportunidade vinculada</option>{deals.filter(deal => !values.clientId || String(deal.clientId) === String(values.clientId)).map(deal => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</select></label>
        </>}
      </div>
    </fieldset>
    {(kind === 'deal' || kind === 'proposal') && clients.length === 0 && <p className="form-error" role="status">Cadastre um cliente antes de criar esta {nouns[kind]}.</p>}
    <div className="form-actions"><button type="button" className="button secondary" onClick={onCancel} disabled={saving}>Cancelar</button><button type="submit" className="button primary" disabled={saving || isLockedProposal || ((kind === 'deal' || kind === 'proposal') && clients.length === 0)}>{saving ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}{saving ? 'Salvando...' : initial?.id ? 'Salvar alterações' : `Criar ${nouns[kind]}`}</button></div>
  </form>;
}
