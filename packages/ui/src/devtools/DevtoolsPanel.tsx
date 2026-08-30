'use client';

import React, { useState, useEffect, useTransition, useCallback, useRef } from 'react';
export interface DevtoolsUser {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  role: string;
  subdomain: string | null;
  customDomain: string | null;
  accentColor: string | null;
  layoutStyle: string | null;
  createdAt: string;
}

export interface DevtoolsStats {
  users: number;
  articles: number;
  posts: number;
  likes: number;
  subscribers: number;
}

export interface SeedJobProgress {
  id: string;
  done: boolean;
  success: boolean;
  error?: string;
  current?: string;
  steps: string[];
  progress: number;
  result?: Record<string, unknown>;
  updatedAt?: string;
}
import './Devtools.css';

import { RefreshCw, Check, Copy, ExternalLink, X, ArrowUpRight } from 'lucide-react';
import { t } from '@lingui/core/macro';

function getMonorepoPorts() {
  if (typeof window === 'undefined') {
    return {
      landing: '15401',
      feed: '15402',
      dashboard: '15404',
      admin: '15405',
      tenant: '15403',
      api: '15407',
    };
  }

  const currentPort = window.location.port;
  const isDocker = ['4000', '4001', '4002', '4020', '4030', '4040'].includes(currentPort);

  if (isDocker) {
    return {
      landing: '15401',
      feed: '15402',
      dashboard: '15404',
      admin: '15405',
      tenant: '15403',
      api: '15407',
    };
  }

  return {
    landing: '15401',
    feed: '15402',
    dashboard: '15404',
    admin: '15405',
    tenant: '15403',
    api: '15407',
  };
}

export interface DevtoolsActions {
  getDevtoolsData: () => Promise<{
    success: boolean;
    users?: DevtoolsUser[];
    stats?: DevtoolsStats;
    error?: string;
  }>;

  createMockUserAction: (data: {
    name: string;
    email: string;
    username: string;
    subdomain: string;
    role: string;
    layoutStyle?: string;
    accentColor?: string;
  }) => Promise<{ success: boolean; error?: string; [key: string]: unknown }>;

  resetDatabaseAction: () => Promise<{ success: boolean; error?: string }>;
  seedTopCompleteAction: () => Promise<{ success: boolean; jobId?: string; error?: string }>;
  seedTopProgressAction: (jobId: string) => Promise<{
    success: boolean;
    job?: SeedJobProgress;
    error?: string;
  }>;
  reindexAction?: () => Promise<{ success: boolean; error?: string }>;
  resetOnboardingAction?: (
    targetEmailOrId?: string
  ) => Promise<{ success: boolean; error?: string }>;

  simulateSubscriberAction: (data: {
    email: string;
    publicationId: string;
    isPremium?: boolean;
    ltvCents?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  simulateFollowAction: (data: {
    readerId: string;
    publicationId: string;
  }) => Promise<{ success: boolean; error?: string }>;

  simulateLikeAction?: (data: {
    postId: string;
    userId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  addMockFundsAction: (data: {
    userId: string;
    amountCents: number;
  }) => Promise<{ success: boolean; balanceCents?: number; error?: string }>;
  impersonateLoginAction?: (email: string) => Promise<{ success: boolean; error?: string }>;
  logoutAction?: () => Promise<{ success: boolean; error?: string }>;
}

export function DevtoolsPanel({ actions }: { actions: DevtoolsActions }) {
  const {
    getDevtoolsData,
    createMockUserAction,
    resetDatabaseAction,
    seedTopCompleteAction,
    seedTopProgressAction,
    reindexAction,
    resetOnboardingAction,
    simulateSubscriberAction,
    addMockFundsAction,
  } = actions;

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [, setHydrated] = useState(false);

  // Restore saved state AFTER hydration to prevent SSR mismatch
  useEffect(() => {
    const savedOpen = localStorage.getItem('qoe_devtools_open');
    const savedTab = localStorage.getItem('qoe_devtools_tab');
    if (savedOpen === 'true') setIsOpen(true);
    if (savedTab) setActiveTab(savedTab);
    setHydrated(true);
  }, []);
  const [users, setUsers] = useState<DevtoolsUser[]>([]);
  const [stats, setStats] = useState<DevtoolsStats | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [creatorForm, setCreatorForm] = useState({
    name: '',
    email: '',
    username: '',
    subdomain: '',
    layoutStyle: 'minimal',
    accentColor: '#3ecf8e',
  });
  const [simSubscribe, setSimSubscribe] = useState({
    email: '',
    publicationId: '',
    isPremium: false,
    ltvCents: 1000,
  });
  const [simWallet, setSimWallet] = useState({ userId: '', amountEuros: '50' });
  const [screenSize, setScreenSize] = useState('');
  const [seedJob, setSeedJob] = useState<SeedJobProgress | null>(null);
  const seedPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSeedPoll = useCallback(() => {
    if (seedPollRef.current) {
      clearTimeout(seedPollRef.current);
      seedPollRef.current = null;
    }
  }, []);

  // Nettoie le polling si le panneau est démonté en cours de seed.
  useEffect(() => () => stopSeedPoll(), [stopSeedPoll]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await getDevtoolsData();
      if (res.success && res.users && res.stats) {
        setUsers(res.users);
        setStats(res.stats);
      } else if (res.error) {
        setAlert({ type: 'error', message: `DB: ${res.error}` });
      }
    } catch (err: unknown) {
      console.error('Failed to refresh devtools data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [getDevtoolsData]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        setScreenSize(`${window.innerWidth} × ${window.innerHeight}`);
      };
      handleResize();
      window.addEventListener('resize', handleResize);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          (e.ctrlKey && e.key === '\\') ||
          (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'd')
        ) {
          e.preventDefault();
          toggleOpen();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen, refreshData]);

  const toggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    localStorage.setItem('qoe_devtools_open', String(nextState));
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem('qoe_devtools_tab', tab);
  };

  const triggerAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleImpersonateLogin = async (email: string) => {
    startTransition(async () => {
      try {
        if (actions.impersonateLoginAction) {
          const res = await actions.impersonateLoginAction(email);
          if (!res.success) {
            triggerAlert('error', res.error || 'Erreur de connexion');
            return;
          }
        }
        triggerAlert('success', `Connecté: ${email}`);
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur de connexion';
        triggerAlert('error', msg);
      }
    });
  };

  const handleLogout = async () => {
    startTransition(async () => {
      if (actions.logoutAction) {
        await actions.logoutAction();
      }
      triggerAlert('success', 'Déconnecté');
      setTimeout(() => {
        window.location.reload();
      }, 800);
    });
  };

  const handleResetDatabase = () => {
    if (!window.confirm('Vider entièrement la base de données ?')) return;
    startTransition(async () => {
      const res = await resetDatabaseAction();
      if (res.success) {
        triggerAlert('success', 'Base de données réinitialisée');
        await refreshData();
      } else {
        triggerAlert('error', res.error || 'Échec');
      }
    });
  };

  const handleResetOnboarding = () => {
    if (!resetOnboardingAction) return;
    startTransition(async () => {
      const res = await resetOnboardingAction();
      if (res.success) {
        triggerAlert('success', '✨ Onboarding réinitialisé ! Rechargement...');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('qoe_onboarding_step');
        }
        await refreshData();
        window.location.reload();
      } else {
        triggerAlert('error', res.error || 'Échec de la réinitialisation');
      }
    });
  };

  const handleSeedTopComplete = () => {
    if (
      !window.confirm(
        'Régénérer la base de test complète ? Reset complet + monde vivant (500 users, 200 articles, 1480 pensées, lectures, interactions, Umami, embeddings, Meilisearch) — la DB actuelle sera écrasée.'
      )
    )
      return;
    startTransition(async () => {
      const res = await seedTopCompleteAction();
      if (!res.success || !res.jobId) {
        triggerAlert('error', res.error || 'Échec du démarrage de la régénération');
        return;
      }
      const jobId = res.jobId;
      setSeedJob({
        id: jobId,
        steps: [],
        current: 'Démarrage…',
        progress: 0,
        done: false,
        success: false,
      });

      const poll = async () => {
        const prog = await seedTopProgressAction(jobId);
        if (prog.success && prog.job) {
          setSeedJob({ ...prog.job, steps: prog.job.steps ?? [] });
          if (prog.job.done) {
            if (prog.job.success) {
              const r = (prog.job.result ?? {}) as Record<string, unknown>;
              const details = [
                `${r.users ?? '?'} comptes`,
                `${r.articles ?? '?'} articles`,
                `${r.posts ?? '?'} posts`,
                `${r.readingSessions ?? '?'} lectures`,
                r.umami ? 'Umami ✓' : null,
                r.meilisearch ? 'Meili ✓' : null,
              ]
                .filter(Boolean)
                .join(' · ');
              triggerAlert('success', `🚀 DB régénérée : ${details}`);
              await refreshData();
              setTimeout(() => window.location.reload(), 1500);
            } else {
              triggerAlert('error', prog.job.error || 'Échec de la régénération');
            }
            return;
          }
        }
        seedPollRef.current = setTimeout(poll, 1000);
      };
      stopSeedPoll();
      seedPollRef.current = setTimeout(poll, 500);
    });
  };

  const handleReindex = () => {
    if (!window.confirm("Re-synchroniser l'index Meilisearch (backfill idempotent) ?")) return;
    startTransition(async () => {
      if (!reindexAction) {
        triggerAlert('error', 'reindexAction non branché');
        return;
      }
      const res = await reindexAction();
      if (res.success) {
        triggerAlert('success', '🔎 Index Meilisearch à jour');
        await refreshData();
      } else {
        triggerAlert('error', res.error || 'Échec reindex');
      }
    });
  };

  const handleCreateCreator = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, username, subdomain, layoutStyle, accentColor } = creatorForm;
    if (!name || !email || !username || !subdomain) {
      triggerAlert('error', 'Veuillez remplir les champs obligatoires.');
      return;
    }

    startTransition(async () => {
      const res = await createMockUserAction({
        name,
        email,
        username,
        subdomain,
        role: 'creator',
        layoutStyle,
        accentColor,
      });

      if (res.success) {
        triggerAlert('success', `Créateur ${name} créé`);
        setCreatorForm({
          name: '',
          email: '',
          username: '',
          subdomain: '',
          layoutStyle: 'minimal',
          accentColor: '#3ecf8e',
        });
        await refreshData();
      } else {
        triggerAlert('error', res.error || 'Erreur');
      }
    });
  };

  const handleSimulateSubscriber = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simSubscribe.email || !simSubscribe.publicationId) {
      triggerAlert('error', 'Email et créateur requis.');
      return;
    }

    startTransition(async () => {
      const res = await simulateSubscriberAction({
        email: simSubscribe.email,
        publicationId: simSubscribe.publicationId,
        isPremium: simSubscribe.isPremium,
        ltvCents: simSubscribe.isPremium ? simSubscribe.ltvCents : 0,
      });
      if (res.success) {
        triggerAlert('success', 'Abonné CRM ajouté');
        await refreshData();
      } else {
        triggerAlert('error', res.error || 'Échec');
      }
    });
  };

  const handleSimulateWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simWallet.userId) {
      triggerAlert('error', 'Sélectionnez un utilisateur.');
      return;
    }
    const cents = Math.round(parseFloat(simWallet.amountEuros) * 100);
    if (isNaN(cents)) {
      triggerAlert('error', 'Montant invalide.');
      return;
    }

    startTransition(async () => {
      const res = await addMockFundsAction({
        userId: simWallet.userId,
        amountCents: cents,
      });
      if (res.success) {
        triggerAlert('success', `Solde: ${((res.balanceCents ?? 0) / 100).toFixed(2)}€`);
        await refreshData();
      } else {
        triggerAlert('error', res.error || 'Échec');
      }
    });
  };

  const ports = getMonorepoPorts();

  const getDynamicUrl = (subdomain: string, targetPort?: string | number) => {
    if (typeof window === 'undefined') return '';
    const hostname = window.location.hostname;

    let suffix = 'lvh.me';
    if (hostname.endsWith('qoe.test')) {
      suffix = 'qoe.test';
    } else if (hostname.endsWith('qoe.fi')) {
      suffix = 'qoe.fi';
    } else if (hostname.endsWith('lvh.me')) {
      suffix = 'lvh.me';
    }

    const tenantSuffix = process.env.NEXT_PUBLIC_DEV_TENANT_SUFFIX || suffix;
    const protocol = window.location.protocol;

    if (subdomain === '') {
      const portPart = targetPort
        ? `:${targetPort}`
        : suffix === 'localhost'
          ? `:${ports.feed}`
          : '';
      return `${protocol}//${suffix}${portPart}`;
    }
    if (subdomain === '*') {
      const portPart = targetPort
        ? `:${targetPort}`
        : suffix === 'localhost'
          ? `:${ports.tenant}`
          : '';
      return `${protocol}//climat.${tenantSuffix}${portPart}`;
    }

    const tenantPort =
      targetPort || (suffix === 'localhost' || suffix === 'lvh.me' ? ports.tenant : '');
    const portPart = tenantPort ? `:${tenantPort}` : '';

    return `${protocol}//${subdomain}.${tenantSuffix}${portPart}`;
  };

  const appLinks = [
    { name: 'Feed', url: getDynamicUrl('', ports.feed), port: ports.feed },
    { name: 'Landing', url: getDynamicUrl('start', ports.landing), port: ports.landing },
    { name: 'Studio', url: getDynamicUrl('studio', ports.dashboard), port: ports.dashboard },
    { name: 'Admin', url: getDynamicUrl('admin', ports.admin), port: ports.admin },
    { name: 'Tenant Web', url: getDynamicUrl('*', ports.tenant), port: ports.tenant },
    { name: 'API Gateway', url: getDynamicUrl('api', ports.api), port: ports.api },
  ];

  const creators = users.filter((u) => u.role === 'creator');

  return (
    <div className="apple-devtools">
      {/* Sleek Minimal Trigger Button */}
      <button
        onClick={toggleOpen}
        className={`apple-trigger ${isOpen ? 'is-active' : ''}`}
        title="Developer Console (Ctrl+\)"
      >
        <span>DevTools</span>
        <span className="apple-shortcut-key">Ctrl+\</span>
      </button>

      {/* Main Slide Panel */}
      {isOpen && (
        <div className="apple-panel">
          {/* Header */}
          <div className="apple-header">
            <div className="flex items-center gap-2">
              <span className="apple-header-title">qoe.fi dev</span>
              <span className="apple-badge">{screenSize}</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={refreshData}
                disabled={isRefreshing}
                className="apple-icon-btn"
                title="Rafraîchir"
              >
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              <button onClick={toggleOpen} className="apple-icon-btn" title="Fermer">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Segmented Control Navigation */}
          <div className="apple-segmented">
            <button
              onClick={() => handleTabChange('services')}
              className={`apple-seg-btn ${activeTab === 'services' ? 'active' : ''}`}
            >
              Services
            </button>
            <button
              onClick={() => handleTabChange('sandbox')}
              className={`apple-seg-btn ${activeTab === 'sandbox' ? 'active' : ''}`}
            >
              Sandbox
            </button>
            <button
              onClick={() => handleTabChange('accounts')}
              className={`apple-seg-btn ${activeTab === 'accounts' ? 'active' : ''}`}
            >
              Accounts
            </button>
            <button
              onClick={() => handleTabChange('metrics')}
              className={`apple-seg-btn ${activeTab === 'metrics' ? 'active' : ''}`}
            >
              Metrics
            </button>
          </div>

          {/* Content Body */}
          <div className="apple-body">
            {isPending && (
              <div className="apple-loader">
                <RefreshCw size={12} className="animate-spin text-muted-foreground" />
                <span>Traitement en cours...</span>
              </div>
            )}

            {alert && (
              <div className={`apple-alert ${alert.type}`}>
                <span>{alert.message}</span>
                <button onClick={() => setAlert(null)}>
                  <X size={11} />
                </button>
              </div>
            )}

            {/* TAB 1: SERVICES & TENANTS */}
            {activeTab === 'services' && (
              <div className="space-y-4">
                <div>
                  <div className="apple-subheading">Applications Monorepo</div>
                  <div className="divide-y divide-border">
                    {appLinks.map((link) => {
                      const isCurrent =
                        typeof window !== 'undefined' && window.location.port === link.port;
                      return (
                        <div key={link.name} className="apple-list-row">
                          <div className="flex items-center gap-2">
                            <span className="apple-row-title">{link.name}</span>
                            <span className="apple-port-tag">:{link.port}</span>
                            {isCurrent && <span className="apple-current-tag">actuel</span>}
                          </div>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="apple-link-btn"
                          >
                            <span>Ouvrir</span>
                            <ArrowUpRight size={11} />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="apple-subheading">Tenants Virtuels ({creators.length})</div>
                  {creators.length === 0 ? (
                    <div className="apple-empty">Aucun créateur. Générez-en un dans Sandbox !</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {creators.map((c) => {
                        const directUrl = getDynamicUrl(c.subdomain || '', ports.tenant);
                        const displayDomain =
                          typeof window !== 'undefined' &&
                          window.location.hostname.endsWith('lvh.me')
                            ? 'lvh.me'
                            : typeof window !== 'undefined' &&
                                window.location.hostname.endsWith('qoe.test')
                              ? 'qoe.test'
                              : 'localhost';

                        return (
                          <div key={c.id} className="apple-list-row">
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="apple-row-title truncate">
                                  {c.name || c.username}
                                </span>
                                <span className="apple-style-tag">
                                  {c.layoutStyle || 'minimal'}
                                </span>
                              </div>
                              <div className="apple-url-text truncate">
                                {c.subdomain}.{displayDomain}:{ports.tenant}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => copyToClipboard(directUrl, c.id)}
                                className="apple-btn-secondary"
                                title="Copier l'URL"
                              >
                                {copiedId === c.id ? <Check size={11} /> : <Copy size={11} />}
                              </button>
                              <a
                                href={directUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="apple-btn-primary"
                              >
                                <span>Visiter</span>
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: SANDBOX */}
            {activeTab === 'sandbox' && (
              <div className="space-y-4">
                <div>
                  <div className="apple-subheading">Actions Rapides</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={handleSeedTopComplete}
                      disabled={isPending || (seedJob !== null && !seedJob.done)}
                      className="apple-btn-primary col-span-2"
                      title="Reset complet + monde vivant : 500 users, 200 articles, 1480 pensées, lectures, interactions, Umami, embeddings, Meilisearch"
                    >
                      {seedJob !== null && !seedJob.done
                        ? '⏳ Régénération en cours…'
                        : '🔄 Régénérer la DB de test complète'}
                    </button>
                    <button
                      onClick={handleReindex}
                      disabled={isPending}
                      className="apple-btn-action col-span-2"
                      title="Re-synchronise les articles vers l'index Meilisearch (seuls les documents manquants sont ajoutés)"
                    >
                      🔎 Réindexer Meili (search)
                    </button>
                    <button
                      onClick={handleResetOnboarding}
                      disabled={isPending}
                      className="apple-btn-action"
                    >
                      Reset Onboarding
                    </button>
                    <button
                      onClick={handleResetDatabase}
                      disabled={isPending}
                      className="apple-btn-danger"
                    >
                      Reset Database
                    </button>
                  </div>
                </div>

                {seedJob && (
                  <div className="apple-box">
                    <div className="apple-box-title">
                      {seedJob.done
                        ? seedJob.success
                          ? '✅ Régénération terminée'
                          : '❌ Régénération en échec'
                        : '🔄 Régénération de la DB en cours…'}
                    </div>
                    <div className="space-y-1 pt-1">
                      {seedJob.steps.map((step) => (
                        <div key={step} className="flex items-center gap-1.5 text-xs">
                          <span className="apple-progress-ok">✓</span>
                          <span className="apple-url-text">{step}</span>
                        </div>
                      ))}
                      {!seedJob.done && seedJob.current && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <RefreshCw size={11} className="animate-spin" />
                          <span className="apple-url-text">{seedJob.current}</span>
                        </div>
                      )}
                      {seedJob.done && !seedJob.success && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="apple-progress-err">✗</span>
                          <span className="apple-progress-err">
                            {seedJob.error || 'Erreur inconnue'}
                          </span>
                        </div>
                      )}
                      {!seedJob.done && (
                        <div className="pt-1">
                          <div className="apple-progress-bar">
                            <div
                              className="apple-progress-bar-fill"
                              style={{ width: `${seedJob.progress}%` }}
                            />
                          </div>
                          <div className="pt-1 text-[10px] text-muted-foreground">
                            {Math.min(seedJob.progress, 99)}% — le seed complet prend ~1-2 min
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="apple-box">
                  <div className="apple-box-title">Simuler un Abonné CRM</div>
                  <form onSubmit={handleSimulateSubscriber} className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="email"
                        required
                        placeholder="email@lecteur.com"
                        className="apple-input"
                        value={simSubscribe.email}
                        onChange={(e) =>
                          setSimSubscribe({ ...simSubscribe, email: e.target.value })
                        }
                      />
                      <select
                        required
                        className="apple-select"
                        value={simSubscribe.publicationId}
                        onChange={(e) =>
                          setSimSubscribe({ ...simSubscribe, publicationId: e.target.value })
                        }
                      >
                        <option value="">{t`-- Créateur --`}</option>
                        {creators.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || c.username}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-border bg-muted"
                          checked={simSubscribe.isPremium}
                          onChange={(e) =>
                            setSimSubscribe({ ...simSubscribe, isPremium: e.target.checked })
                          }
                        />
                        <span>Premium</span>
                      </label>
                      {simSubscribe.isPremium && (
                        <select
                          className="apple-select text-xs py-0.5 px-1.5"
                          value={simSubscribe.ltvCents}
                          onChange={(e) =>
                            setSimSubscribe({ ...simSubscribe, ltvCents: parseInt(e.target.value) })
                          }
                        >
                          <option value="500">5.00 €</option>
                          <option value="1000">10.00 €</option>
                          <option value="2000">20.00 €</option>
                        </select>
                      )}
                    </div>
                    <button type="submit" disabled={isPending} className="apple-btn-submit">
                      Ajouter l&apos;Abonné
                    </button>
                  </form>
                </div>

                <div className="apple-box">
                  <div className="apple-box-title">Ajuster Portefeuille</div>
                  <form onSubmit={handleSimulateWallet} className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        required
                        className="apple-select"
                        value={simWallet.userId}
                        onChange={(e) => setSimWallet({ ...simWallet, userId: e.target.value })}
                      >
                        <option value="">-- Membre --</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.username} ({u.role})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="Montant €"
                        className="apple-input"
                        value={simWallet.amountEuros}
                        onChange={(e) =>
                          setSimWallet({ ...simWallet, amountEuros: e.target.value })
                        }
                      />
                    </div>
                    <button type="submit" disabled={isPending} className="apple-btn-submit">
                      Ajuster le Solde
                    </button>
                  </form>
                </div>

                <div className="apple-box">
                  <div className="apple-box-title">Nouveau Créateur</div>
                  <form onSubmit={handleCreateCreator} className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        required
                        placeholder="Nom complet"
                        className="apple-input"
                        value={creatorForm.name}
                        onChange={(e) => setCreatorForm({ ...creatorForm, name: e.target.value })}
                      />
                      <input
                        type="email"
                        required
                        placeholder="Email"
                        className="apple-input"
                        value={creatorForm.email}
                        onChange={(e) => setCreatorForm({ ...creatorForm, email: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        required
                        placeholder="username"
                        className="apple-input"
                        value={creatorForm.username}
                        onChange={(e) =>
                          setCreatorForm({
                            ...creatorForm,
                            username: e.target.value.toLowerCase().trim(),
                          })
                        }
                      />
                      <input
                        type="text"
                        required
                        placeholder="sous-domaine"
                        className="apple-input"
                        value={creatorForm.subdomain}
                        onChange={(e) =>
                          setCreatorForm({
                            ...creatorForm,
                            subdomain: e.target.value.toLowerCase().trim(),
                          })
                        }
                      />
                    </div>
                    <button type="submit" disabled={isPending} className="apple-btn-submit">
                      Créer le Créateur
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 3: ACCOUNTS */}
            {activeTab === 'accounts' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="apple-subheading mb-0">Comptes ({users.length})</span>
                  <button
                    onClick={handleLogout}
                    disabled={isPending}
                    className="apple-btn-danger text-xs py-0.5 px-2"
                  >
                    Déconnecter Tout
                  </button>
                </div>

                <div className="divide-y divide-border">
                  {users.length === 0 ? (
                    <div className="apple-empty">
                      Aucun utilisateur. Régénérez la DB de test dans Sandbox !
                    </div>
                  ) : (
                    users.map((user) => {
                      const isCopied = copiedId === user.id;
                      return (
                        <div key={user.id} className="apple-list-row">
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="apple-row-title truncate">
                                {user.name || user.username || 'Sans nom'}
                              </span>
                              <span className="apple-role-tag">{user.role}</span>
                            </div>
                            <div className="apple-url-text truncate">{user.email}</div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => copyToClipboard(user.email, user.id)}
                              className="apple-btn-secondary"
                              title="Copier email"
                            >
                              {isCopied ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                            <button
                              onClick={() => {
                                if (!resetOnboardingAction) return;
                                startTransition(async () => {
                                  const res = await resetOnboardingAction(user.id);
                                  if (res.success) {
                                    triggerAlert(
                                      'success',
                                      `✨ Onboarding réinitialisé pour ${user.name || user.username} !`
                                    );
                                    await handleImpersonateLogin(user.email);
                                  } else {
                                    triggerAlert('error', res.error || 'Échec');
                                  }
                                });
                              }}
                              disabled={isPending}
                              className="apple-btn-secondary"
                              title="Relancer le flow Onboarding pour ce compte"
                            >
                              Onboarding
                            </button>
                            <button
                              onClick={() => handleImpersonateLogin(user.email)}
                              disabled={isPending}
                              className="apple-btn-primary"
                            >
                              Connexion
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: METRICS */}
            {activeTab === 'metrics' && (
              <div className="space-y-4">
                <div>
                  <div className="apple-subheading">Compteurs Base de Données</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="apple-stat-card">
                      <span className="apple-stat-num">{stats?.users ?? 0}</span>
                      <span className="apple-stat-lbl">Membres</span>
                    </div>
                    <div className="apple-stat-card">
                      <span className="apple-stat-num">{stats?.articles ?? 0}</span>
                      <span className="apple-stat-lbl">Articles</span>
                    </div>
                    <div className="apple-stat-card">
                      <span className="apple-stat-num">{stats?.posts ?? 0}</span>
                      <span className="apple-stat-lbl">Pensées</span>
                    </div>
                    <div className="apple-stat-card">
                      <span className="apple-stat-num">{stats?.likes ?? 0}</span>
                      <span className="apple-stat-lbl">Likes</span>
                    </div>
                    <div className="apple-stat-card col-span-2">
                      <span className="apple-stat-num">{stats?.subscribers ?? 0}</span>
                      <span className="apple-stat-lbl">Abonnés CRM</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="apple-subheading">Diagnostics System</div>
                  <div className="divide-y divide-border text-xs text-muted-foreground">
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">Mode</span>
                      <span className="text-muted-foreground">development</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">API Go</span>
                      <span className="flex items-center gap-1">
                        <span className={`apple-status-dot ${stats ? 'on' : 'off'}`} />
                        {`localhost:${ports.api}`}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">Viewport</span>
                      <span>{screenSize}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">Host</span>
                      <span>
                        {typeof window !== 'undefined' ? window.location.hostname : 'SSR'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">Prisma Studio</span>
                      <span>http://localhost:5555</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
