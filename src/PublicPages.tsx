import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, BarChart3, Check, CheckCircle2, ChevronRight, Circle, FileText, Layers3, Link2, LoaderCircle, Menu, Plus, ShieldCheck, Sparkles, Target, TrendingUp, Users, X } from 'lucide-react';
import './public.css';

const money = (amount: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(amount);
const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));

function Brand({ light = false }: { light?: boolean }) {
  return <a className={`public-brand ${light ? 'public-brand-light' : ''}`} href="/" aria-label="Pairon — início"><span className="public-brand-mark"><Layers3 size={21} strokeWidth={2.1} /></span><span>pairon<span className="public-brand-dot">.</span></span></a>;
}

type LandingProps = { onAuth: (mode: 'login' | 'register') => void; onDemo: () => void; demoLoading: boolean };

export function Landing({ onAuth, onDemo, demoLoading }: LandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="public-root">
    <header className="public-header public-container">
      <Brand />
      <nav className={menuOpen ? 'public-nav public-nav-open' : 'public-nav'} aria-label="Navegação principal">
        <a href="#recursos" onClick={() => setMenuOpen(false)}>O produto</a>
        <a href="#como-funciona" onClick={() => setMenuOpen(false)}>Como funciona</a>
        <a href="#precos" onClick={() => setMenuOpen(false)}>Preços</a>
      </nav>
      <div className="public-nav-actions"><button className="public-text-button" onClick={() => onAuth('login')}>Entrar</button><button className="public-button public-button-small" onClick={() => onAuth('register')}>Começar agora <ArrowUpRight size={16} /></button></div>
      <button className="public-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>
    </header>

    <main>
      <section className="public-hero public-container">
        <div className="public-hero-copy">
          <div className="public-eyebrow"><span /> PARA AGÊNCIAS E CONSULTORIAS</div>
          <h1>Seu próximo<br />contrato<br /><em>começa aqui.</em></h1>
          <p>Da primeira conversa ao sim do cliente. Organize suas oportunidades, envie propostas e dê previsibilidade à sua receita.</p>
          <div className="public-hero-actions"><button className="public-button" onClick={() => onAuth('register')}>Organizar minhas vendas <ArrowUpRight size={18} /></button><button className="public-demo-button" onClick={onDemo} disabled={demoLoading}>{demoLoading ? <LoaderCircle className="public-spin" size={17} /> : <span className="public-play">▶</span>} {demoLoading ? 'Preparando demonstração...' : 'Explorar demonstração'}</button></div>
          <div className="public-hero-footnote"><CheckCircle2 size={15} /> Sem cartão de crédito <span>·</span> Seu workspace em minutos</div>
        </div>

        <div className="public-product-scene" aria-label="Ilustração das ferramentas do Pairon com valores de exemplo">
          <div className="public-scene-spark public-scene-spark-one">✳</div>
          <div className="public-product-window">
            <div className="public-window-bar"><div><span /><span /><span /></div><span>Seu negócio, em um só lugar</span><span><ShieldCheck size={12} /></span></div>
            <div className="public-mini-app">
              <aside className="public-mini-sidebar"><div className="public-mini-logo"><Layers3 size={17} /> pairon.</div><div className="public-mini-nav public-mini-nav-active"><BarChart3 size={13} /> Visão geral</div><div className="public-mini-nav"><Layers3 size={13} /> Pipeline</div><div className="public-mini-nav"><Users size={13} /> Clientes</div><div className="public-mini-nav"><FileText size={13} /> Propostas</div><div className="public-mini-nav"><Target size={13} /> Sua meta</div><div className="public-mini-avatar">AC <span>Agência Criativa<small>Seu workspace</small></span></div></aside>
              <div className="public-mini-main"><div className="public-mini-top"><div><span>VISÃO GERAL</span><h3>Bom dia, Ana <span>✦</span></h3><p>Seu negócio está em movimento.</p></div><span className="public-mini-add"><Plus size={11} /> Nova proposta</span></div><div className="public-mini-kpis"><div><span>Receita recorrente</span><strong>R$ 24.800<span>,00</span></strong><small><TrendingUp size={10} /> Contratos conquistados</small></div><div><span>Novas oportunidades</span><strong>12</strong><small>Conversas que viram negócios</small></div></div><div className="public-mini-chart"><div><strong>Seu funil comercial</strong><span>Exemplo ilustrativo</span></div><div className="public-mini-bars"><div style={{height:'78%'}}><span>Leads</span></div><div style={{height:'59%'}}><span>Propostas</span></div><div style={{height:'44%'}}><span>Negociação</span></div><div style={{height:'32%'}}><span>Ganhos</span></div></div></div><div className="public-mini-bottom"><span className="public-mini-client">N</span><div><strong>Nova identidade visual</strong><span>Studio Norte · Proposta enviada</span></div><strong>R$ 8.500 <ChevronRight size={12} /></strong></div></div>
            </div>
          </div>
          <div className="public-floating-contract"><span className="public-floating-icon"><Check size={19} /></span><div><strong>É um sim! ✨</strong><span>Proposta aceita pelo cliente</span></div><span className="public-floating-time">agora</span></div>
          <div className="public-scene-note"><span /> Um próximo passo para cada oportunidade.</div>
        </div>
      </section>

      <section className="public-audience public-container" aria-label="Público do produto"><p>FEITO PARA QUEM TRANSFORMA CONHECIMENTO EM VALOR</p><div><span>Agências criativas</span><span className="public-audience-dot">✦</span><span>Consultorias</span><span className="public-audience-dot">✦</span><span>Estúdios de design</span><span className="public-audience-dot">✦</span><span>Empresas de serviços</span></div></section>

      <section className="public-features public-container" id="recursos">
        <div className="public-section-heading"><div><div className="public-eyebrow">MAIS CLAREZA. MAIS NEGÓCIOS.</div><h2>Menos abas abertas.<br />Mais oportunidades fechadas.</h2></div><p>Você cuida do que faz melhor.<br />O Pairon organiza o caminho até a venda.</p></div>
        <div className="public-feature-grid">
          <article className="public-feature-card"><div className="public-feature-icon"><Layers3 size={23} /></div><h3>Cada conversa tem<br />um próximo passo.</h3><p>Visualize seu pipeline, acompanhe negociações e saiba quais clientes precisam da sua atenção.</p><div className="public-feature-pipeline"><span>Lead</span><ArrowRight size={14} /><span>Proposta</span><ArrowRight size={14} /><span><Check size={12} /> Ganho</span></div></article>
          <article className="public-feature-card"><div className="public-feature-icon public-icon-peach"><FileText size={23} /></div><h3>Propostas que saem<br />do rascunho.</h3><p>Monte sua oferta, compartilhe um link com o cliente e registre o aceite em um único lugar.</p><div className="public-feature-link"><Link2 size={14} /><span>Sua proposta, pronta para compartilhar</span><CheckCircle2 size={15} /></div></article>
          <article className="public-feature-card"><div className="public-feature-icon public-icon-mint"><TrendingUp size={23} /></div><h3>Uma direção clara<br />para crescer.</h3><p>Acompanhe contratos recorrentes e transforme uma meta de receita em números que você entende.</p><div className="public-feature-goal"><div><span>Sua próxima meta</span><strong>Em construção <Sparkles size={12} /></strong></div><span><i /></span></div></article>
        </div>
      </section>

      <section className="public-how-section" id="como-funciona"><div className="public-container public-how"><div className="public-how-copy"><div className="public-eyebrow">DO CONTATO AO CONTRATO</div><h2>Seu processo comercial.<br />Com espaço para crescer.</h2><p>Sem começar por uma configuração complicada. Comece pela próxima oportunidade.</p><button className="public-demo-link" onClick={onDemo} disabled={demoLoading}>{demoLoading ? 'Preparando...' : 'Conhecer o produto por dentro'} <ArrowUpRight size={18} /></button></div><div className="public-how-steps"><div><span>01</span><article><h3>Reúna seus clientes</h3><p>Contatos, informações e oportunidades no mesmo workspace.</p></article></div><div><span>02</span><article><h3>Apresente sua melhor proposta</h3><p>Serviços, valores e validade em um link simples de compartilhar.</p></article></div><div><span>03</span><article><h3>Acompanhe cada conquista</h3><p>Registre o aceite e veja o impacto dos contratos na sua receita.</p></article></div></div></div></section>

      <section className="public-pricing public-container" id="precos"><div className="public-pricing-intro"><div className="public-eyebrow">UM PRODUTO. UM PLANO CLARO.</div><h2>Invista no próximo<br />capítulo do seu negócio.</h2><p>Uma proposta de preço simples para agências e consultorias que querem organizar o comercial.</p><div className="public-price-note"><Target size={21} /><p><strong>Um lugar para cada próximo passo.</strong><br />Comece pelo primeiro cliente. Centralize contatos, propostas e acompanhamento em uma rotina comercial clara.</p></div></div><div className="public-price-card"><div className="public-price-card-top"><span>PAIRON ESSENCIAL</span><span className="public-price-badge">Plano de lançamento</span></div><div className="public-price-amount">R$ 497<span>/mês</span></div><p>Preço de referência da oferta comercial.</p><ul>{['Gestão de clientes e oportunidades','Pipeline comercial completo','Propostas com link e registro de aceite','Tarefas e próximos passos','Visão de receita e planejamento de metas'].map(item => <li key={item}><CheckCircle2 size={16} />{item}</li>)}</ul><button className="public-button" onClick={() => onAuth('register')}>Começar meu workspace <ArrowUpRight size={17} /></button><small>Experimente o MVP sem cobrança automática. Pagamentos ainda não estão integrados.</small></div></section>

      <section className="public-final-cta public-container"><div><span className="public-eyebrow">O PRÓXIMO PASSO É SEU</span><h2>Seu trabalho merece<br />um comercial à altura.</h2></div><button className="public-button public-button-white" onClick={() => onAuth('register')}>Começar com o Pairon <ArrowUpRight size={18} /></button><span className="public-cta-decoration" aria-hidden="true">✳</span></section>
    </main>
    <footer className="public-footer public-container"><Brand /><span>Mais clareza para vender. Mais espaço para crescer.</span><span>© {new Date().getFullYear()} Pairon</span></footer>
  </div>;
}

type PublicItem = { description: string; quantity: number; unitPrice: number };
type PublicData = { company: string; client: { name: string; company?: string }; proposal: { id: string; title: string; status: string; items: PublicItem[]; total?: number; message?: string; validUntil?: string; acceptedAt?: string; acceptedBy?: string } };

export function PublicProposal({ token }: { token: string }) {
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [name, setName] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/public/proposals/${encodeURIComponent(token)}`, { signal: controller.signal, credentials: 'include' }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível abrir esta proposta.'); setData(result); }).catch(cause => { if (cause.name !== 'AbortError') setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, reload]);
  const proposal = data?.proposal;
  const expired = !!proposal?.validUntil && proposal.validUntil.slice(0, 10) < new Date().toLocaleDateString('en-CA');
  const accepted = proposal?.status === 'accepted';
  const total = proposal?.total ?? proposal?.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) ?? 0;
  async function accept(event: FormEvent) {
    event.preventDefault(); setAccepting(true); setError('');
    try { const response = await fetch(`/api/public/proposals/${encodeURIComponent(token)}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: name.trim() }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível registrar seu aceite.'); setReload(value => value + 1); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar seu aceite.'); } finally { setAccepting(false); }
  }
  return <div className="proposal-public"><header className="proposal-public-header"><Brand /><span><ShieldCheck size={15} /> Proposta compartilhada com você</span></header><main className="proposal-public-main">
    {loading ? <div className="proposal-public-state"><LoaderCircle size={30} className="public-spin" /><h1>Abrindo sua proposta...</h1></div> : !data || !proposal ? <div className="proposal-public-state"><FileText size={38} /><h1>Não encontramos esta proposta</h1><p>{error || 'Confira o link recebido com quem enviou a proposta.'}</p><button className="public-button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div> : <><div className="proposal-public-overline"><span>{data.company}</span><span className={accepted ? 'proposal-public-status proposal-public-accepted' : 'proposal-public-status'}>{accepted ? <CheckCircle2 size={14} /> : <Circle size={11} />}{accepted ? 'Proposta aceita' : expired ? 'Prazo encerrado' : proposal.status === 'draft' ? 'Rascunho' : proposal.status === 'declined' ? 'Proposta recusada' : 'Proposta comercial'}</span></div><section className="proposal-public-document"><div className="proposal-public-title"><span>UM NOVO CAPÍTULO, JUNTOS.</span><h1>{proposal.title}</h1><p>Preparada para <strong>{data.client.company || data.client.name}</strong></p></div><div className="proposal-public-meta"><div><span>APRESENTADA POR</span><strong>{data.company}</strong></div><div><span>CLIENTE</span><strong>{data.client.name}</strong></div>{proposal.validUntil && <div><span>VÁLIDA ATÉ</span><strong>{date(proposal.validUntil)}</strong></div>}</div>{proposal.message && <div className="proposal-public-message"><h2>Sobre nossa proposta</h2><p>{proposal.message}</p></div>}<div className="proposal-public-items"><h2>O que vamos construir</h2><div className="proposal-public-table-wrap"><table><thead><tr><th>Serviço / entrega</th><th>Qtd.</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>{proposal.items.map((item, index) => <tr key={index}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table></div><div className="proposal-public-total"><span>Investimento total</span><strong>{money(total)}</strong></div></div>{accepted ? <div className="proposal-public-success"><CheckCircle2 size={27} /><div><h2>Vamos começar!</h2><p>Proposta aceita por <strong>{proposal.acceptedBy || 'você'}</strong>{proposal.acceptedAt ? ` em ${date(proposal.acceptedAt)}` : ''}. Seu aceite foi registrado.</p></div></div> : expired || proposal.status === 'draft' || proposal.status === 'declined' ? <div className="proposal-public-unavailable"><h2>{expired ? 'O prazo desta proposta encerrou.' : 'Esta proposta não está disponível para aceite.'}</h2><p>Fale com {data.company} para combinar os próximos passos.</p></div> : <form className="proposal-public-accept" onSubmit={accept}><div><h2>Pronto para o próximo passo?</h2><p>Registre seu aceite para que a equipe possa entrar em contato.</p></div><label htmlFor="proposal-signer">Seu nome completo<input id="proposal-signer" name="name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="Como você se chama?" autoComplete="name" /></label>{error && <p className="proposal-public-error" role="alert">{error}</p>}<button className="public-button" disabled={accepting || name.trim().length < 2}>{accepting ? <LoaderCircle className="public-spin" size={17} /> : <CheckCircle2 size={17} />}{accepting ? 'Registrando aceite...' : 'Aceitar proposta'}</button><small>Seu nome e o aceite serão registrados. Esta ação não realiza cobranças.</small></form>}</section><div className="proposal-public-bottom"><span>Apresentado com <strong>pairon.</strong></span><button onClick={() => window.print()}>Imprimir ou salvar PDF <ArrowUpRight size={14} /></button></div></>}
  </main></div>;
}
