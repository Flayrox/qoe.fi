"use client";

import React, { useState, useEffect, useTransition } from "react";
import { createClient } from "@qoe/supabase/client";
import {
  getDevtoolsData,
  createMockUserAction,
  generateMockFeedPostsAction,
  resetDatabaseAction,
  simulateSubscriberAction,
  simulateFollowAction,
  simulateLikeAction,
  addMockFundsAction,
  type DevtoolsUser,
  type DevtoolsStats,
} from "./actions";
import "./Devtools.css";

// Lucide React Icons (Direct imports to avoid bundling bloated imports)
import {
  Wrench,
  Settings,
  Terminal,
  Database,
  Users,
  Activity,
  RefreshCw,
  Trash2,
  Plus,
  Check,
  Copy,
  ExternalLink,
  Lock,
  Zap,
  Coins,
  Mail,
  UserPlus,
  X,
  Sparkles,
} from "lucide-react";

// Helper to determine active monorepo dev ports dynamically (Local 30xx or Docker 40xx)
function getMonorepoPorts() {
  if (typeof window === "undefined") {
    // Default fallback to Local ports in Server Side Rendering
    return {
      landing: "3040",
      feed: "3010",
      dashboard: "3020",
      admin: "3030",
      tenant: "3001",
      api: "3002",
      prisma: "5555",
    };
  }

  const currentPort = window.location.port;
  // If the current window port matches a docker container port (starts with 40 or 40xx)
  const isDocker = ["4000", "4001", "4002", "4020", "4030", "4040"].includes(currentPort);

  if (isDocker) {
    return {
      landing: "4040",
      feed: "4000",
      dashboard: "4020",
      admin: "4030",
      tenant: "4001",
      api: "4002",
      prisma: "5555",
    };
  }

  // Local pnpm/npm dev ports (3000 series)
  return {
    landing: "3040",
    feed: "3010",
    dashboard: "3020",
    admin: "3030",
    tenant: "3001",
    api: "3002",
    prisma: "5555",
  };
}

export function DevtoolsPanel() {
  // 🧭 UI States
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("jumper"); // "jumper", "sandbox", "impersonator", "stats"
  const [isPending, startTransition] = useTransition();

  // 📊 Live Data States
  const [users, setUsers] = useState<DevtoolsUser[]>([]);
  const [stats, setStats] = useState<DevtoolsStats>({
    users: 0,
    articles: 0,
    posts: 0,
    likes: 0,
    subscribers: 0,
  });

  // 🔔 Alert notifications inside panel
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 📋 Copy indicator states
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ✍️ Creator Form state
  const [creatorForm, setCreatorForm] = useState({
    name: "",
    email: "",
    username: "",
    subdomain: "",
    layoutStyle: "minimal",
    accentColor: "#c5a880",
  });

  // ✍️ Reader Form state
  const [readerForm, setReaderForm] = useState({
    name: "",
    email: "",
    username: "",
  });

  // 🤝 Advanced Simulation states
  const [simFollow, setSimFollow] = useState({ readerId: "", creatorId: "" });
  const [simSubscribe, setSimSubscribe] = useState({
    email: "",
    creatorId: "",
    isPremium: false,
    ltvCents: 1000, // €10.00 default
  });
  const [simWallet, setSimWallet] = useState({ userId: "", amountEuros: "50" });

  // 📱 Device Screen Diagnostics
  const [screenSize, setScreenSize] = useState("");

  // 🔐 Supabase client for impersonation
  const supabase = createClient();

  // 🔄 Fetch Database data
  const refreshData = async () => {
    const res = await getDevtoolsData();
    if (res.success && res.users && res.stats) {
      setUsers(res.users);
      setStats(res.stats);
    } else if (res.error) {
      triggerAlert("error", `Erreur DB: ${res.error}`);
    }
  };

  // 📦 Persist Panel state in LocalStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedOpen = localStorage.getItem("qoe_devtools_open");
      const savedTab = localStorage.getItem("qoe_devtools_tab");
      if (savedOpen === "true") setIsOpen(true);
      if (savedTab) setActiveTab(savedTab);

      // Listen to resize to display viewport diagnostics
      const handleResize = () => {
        setScreenSize(`${window.innerWidth}px × ${window.innerHeight}px`);
      };
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  const toggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    localStorage.setItem("qoe_devtools_open", String(nextState));
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem("qoe_devtools_tab", tab);
  };

  // ⏰ Custom Alert trigger helper
  const triggerAlert = (type: "success" | "error", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  // 📋 Copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // 🔐 Impersonator : Programmatic quick sign in
  const handleImpersonateLogin = async (email: string) => {
    startTransition(async () => {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: "password123",
        });

        if (error) {
          triggerAlert("error", `Échec connexion Supabase: ${error.message}`);
          return;
        }

        triggerAlert("success", `Connecté en tant que ${email} ! Redémarrage...`);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err: any) {
        triggerAlert("error", err?.message || "Erreur de connexion");
      }
    });
  };

  const handleLogout = async () => {
    startTransition(async () => {
      await supabase.auth.signOut();
      triggerAlert("success", "Déconnecté ! Redémarrage...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  };

  // 🧹 Database Action handlers
  const handleResetDatabase = () => {
    if (!window.confirm("⚠️ Attention: Êtes-vous sûr de vouloir VIDER ENTIÈREMENT la base de données ?")) return;
    startTransition(async () => {
      const res = await resetDatabaseAction();
      if (res.success) {
        triggerAlert("success", "La base de données a été nettoyée proprement !");
        refreshData();
      } else {
        triggerAlert("error", `Échec du reset: ${res.error}`);
      }
    });
  };

  const handleSeedCompletePack = () => {
    startTransition(async () => {
      // 1. Reset Database
      await resetDatabaseAction();
      // 2. Create standard profiles
      const creatorsToSeed = [
        { name: "Jean-Marc Jancovici", email: "philo@qoe.fi", username: "jancovici", subdomain: "climat", style: "minimal", color: "#22c55e" },
        { name: "Souveraineté Média", email: "militant@qoe.fi", username: "souverain", subdomain: "souverainete", style: "brutalist", color: "#c5a880" },
        { name: "Auteur Écologiste", email: "eco@qoe.fi", username: "ecologue", subdomain: "ecologie", style: "magazine", color: "#0ea5e9" },
      ];

      let anyAuthWarning = false;

      for (const creator of creatorsToSeed) {
        const res = await createMockUserAction({
          name: creator.name,
          email: creator.email,
          username: creator.username,
          subdomain: creator.subdomain,
          role: "creator",
          layoutStyle: creator.style,
          accentColor: creator.color,
        });
        if (res.success && res.authWarning) {
          anyAuthWarning = true;
        }
      }

      // Inscrire également un admin et quelques lecteurs de test
      const adminRes = await createMockUserAction({
        name: "Super Administrateur",
        email: "admin@qoe.fi",
        username: "admin",
        subdomain: "admin",
        role: "superadmin",
      });
      if (adminRes.success && adminRes.authWarning) {
        anyAuthWarning = true;
      }

      const readersToSeed = [
        { name: "Lucas Le Lecteur", email: "lucas@gmail.com", username: "lucas" },
        { name: "Sophie Curieuse", email: "sophie@gmail.com", username: "sophie" },
      ];

      for (const reader of readersToSeed) {
        const res = await createMockUserAction({
          name: reader.name,
          email: reader.email,
          username: reader.username,
          subdomain: "",
          role: "user",
        });
        if (res.success && res.authWarning) {
          anyAuthWarning = true;
        }
      }

      // 3. Seed some posts
      await generateMockFeedPostsAction();

      if (anyAuthWarning) {
        triggerAlert("success", "Base de données peuplée avec succès ! ⚠️ Note : Supabase Auth non connecté (clé Service Role manquante/invalide dans .env)");
      } else {
        triggerAlert("success", "Pack d'essai complet injecté avec succès !");
      }
      refreshData();
    });
  };

  const handleSeedThoughts = () => {
    startTransition(async () => {
      const res = await generateMockFeedPostsAction();
      if (res.success) {
        triggerAlert("success", "15 micro-posts de feed ont été ajoutés !");
        refreshData();
      } else {
        triggerAlert("error", `Impossible de peupler: ${res.error}`);
      }
    });
  };

  // ➕ Form submissions
  const handleCreateCreator = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, username, subdomain, layoutStyle, accentColor } = creatorForm;
    if (!name || !email || !username || !subdomain) {
      triggerAlert("error", "Veuillez remplir tous les champs obligatoires du créateur.");
      return;
    }

    startTransition(async () => {
      const res = await createMockUserAction({
        name,
        email,
        username,
        subdomain,
        role: "creator",
        layoutStyle,
        accentColor,
      });

      if (res.success) {
        triggerAlert("success", `Créateur ${name} créé avec succès ! (mdp: password123)`);
        setCreatorForm({ name: "", email: "", username: "", subdomain: "", layoutStyle: "minimal", accentColor: "#c5a880" });
        refreshData();
      } else {
        triggerAlert("error", `Erreur: ${res.error}`);
      }
    });
  };

  const handleCreateReader = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, username } = readerForm;
    if (!name || !email || !username) {
      triggerAlert("error", "Veuillez remplir tous les champs du lecteur.");
      return;
    }

    startTransition(async () => {
      const res = await createMockUserAction({
        name,
        email,
        username,
        subdomain: "",
        role: "user",
      });

      if (res.success) {
        triggerAlert("success", `Lecteur ${name} créé ! (mdp: password123)`);
        setReaderForm({ name: "", email: "", username: "" });
        refreshData();
      } else {
        triggerAlert("error", `Erreur: ${res.error}`);
      }
    });
  };

  // 🤝 Advanced Simulations trigger handlers
  const handleSimulateFollow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simFollow.readerId || !simFollow.creatorId) {
      triggerAlert("error", "Sélectionnez un lecteur et un créateur.");
      return;
    }

    startTransition(async () => {
      const res = await simulateFollowAction({
        readerId: simFollow.readerId,
        creatorId: simFollow.creatorId,
      });
      if (res.success) {
        triggerAlert("success", "Lien d'abonnement (Follow) activé avec succès !");
        refreshData();
      } else {
        triggerAlert("error", res.error || "Échec");
      }
    });
  };

  const handleSimulateSubscriber = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simSubscribe.email || !simSubscribe.creatorId) {
      triggerAlert("error", "Renseignez un email et sélectionnez un créateur.");
      return;
    }

    startTransition(async () => {
      const res = await simulateSubscriberAction({
        email: simSubscribe.email,
        creatorId: simSubscribe.creatorId,
        isPremium: simSubscribe.isPremium,
        ltvCents: simSubscribe.isPremium ? simSubscribe.ltvCents : 0,
      });
      if (res.success) {
        triggerAlert("success", "Abonnement CRM (Subscriber) simulé !");
        refreshData();
      } else {
        triggerAlert("error", res.error || "Échec");
      }
    });
  };

  const handleSimulateWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simWallet.userId) {
      triggerAlert("error", "Sélectionnez un utilisateur.");
      return;
    }
    const cents = Math.round(parseFloat(simWallet.amountEuros) * 100);
    if (isNaN(cents)) {
      triggerAlert("error", "Montant invalide.");
      return;
    }

    startTransition(async () => {
      const res = await addMockFundsAction({
        userId: simWallet.userId,
        amountCents: cents,
      });
      if (res.success) {
        triggerAlert("success", `Portefeuille mis à jour ! Nouveau solde: ${((res.balanceCents ?? 0) / 100).toFixed(2)}€`);
        refreshData();
      } else {
        triggerAlert("error", res.error || "Échec");
      }
    });
  };

  const ports = getMonorepoPorts();

  // 🏥 Host diagnostics helpers
  const getAppNameFromPort = () => {
    if (typeof window === "undefined") return "Chargement...";

    // Check for local creator subdomain host first to be accurate
    const parts = window.location.hostname.split(".");
    if (parts.length > 1 && parts[0] !== "localhost" && parts[0] !== "www") {
      return `Sous-domaine (${parts[0]})`;
    }

    const port = window.location.port;
    if (port === ports.landing) return "Landing Vitrine";
    if (port === ports.feed) return "Espace Feed";
    if (port === ports.dashboard) return "Dashboard Créateur";
    if (port === ports.admin) return "Admin Console";
    if (port === ports.tenant) return "Tenant Web Portal";
    
    return "Portail Local";
  };

  const getActiveAppBadgeColor = () => {
    const app = getAppNameFromPort();
    if (app === "Landing Vitrine" || app.startsWith("Sous-domaine")) return "#c5a880"; // Gold
    if (app === "Espace Feed") return "#c084fc"; // Purple
    if (app === "Dashboard Créateur") return "#38bdf8"; // Sky Blue
    if (app === "Admin Console") return "#f87171"; // Red-orange
    if (app === "Tenant Web Portal") return "#22c55e"; // Emerald
    return "#94a3b8"; // Gray
  };

  // 🔗 Predefined Monorepo Links
  const appLinks = [
    { name: "Landing Vitrine", url: `http://localhost:${ports.landing}`, port: ports.landing, icon: "🌐" },
    { name: "Espace Feed / Lecteur", url: `http://localhost:${ports.feed}`, port: ports.feed, icon: "💬" },
    { name: "Studio Créateur (Console)", url: `http://localhost:${ports.dashboard}`, port: ports.dashboard, icon: "🎨" },
    { name: "Admin Console", url: `http://localhost:${ports.admin}`, port: ports.admin, icon: "🛡️" },
    { name: "Tenant Portal (Web)", url: `http://localhost:${ports.tenant}`, port: ports.tenant, icon: "📄" },
    { name: "API Gateway", url: `http://localhost:${ports.api}`, port: ports.api, icon: "⚡" },
    { name: "Prisma Studio (GUI)", url: `http://localhost:${ports.prisma}`, port: ports.prisma, icon: "💾" },
  ];

  const creators = users.filter((u) => u.role === "creator");

  return (
    <div className="qoe-devtools-container">
      {/* 🔔 Pulsing Floating Toggle Button */}
      <button
        onClick={toggleOpen}
        className={`qoe-devtools-trigger ${isOpen ? "active" : ""}`}
        title="Ouvrir le Panneau de Débogage QOE"
      >
        {isOpen ? <X size={20} /> : <Wrench size={20} className="qoe-pulse-animation" />}
      </button>

      {/* 🗃️ Sliding Drawer */}
      {isOpen && (
        <div className="qoe-devtools-drawer">
          {/* Header */}
          <div className="qoe-devtools-header">
            <span className="qoe-devtools-title">
              <Terminal size={14} style={{ color: "#c5a880" }} /> QOE.FI DEVTOOL
            </span>
            <span
              className="qoe-devtools-app-badge"
              style={{
                borderColor: getActiveAppBadgeColor(),
                color: getActiveAppBadgeColor(),
                backgroundColor: `${getActiveAppBadgeColor()}15`,
              }}
            >
              {getAppNameFromPort()}
            </span>
          </div>

          {/* Tabs Navigation */}
          <div className="qoe-devtools-tabs">
            <button
              onClick={() => handleTabChange("jumper")}
              className={`qoe-devtools-tab-btn ${activeTab === "jumper" ? "active" : ""}`}
            >
              🔌 Quick Jump
            </button>
            <button
              onClick={() => handleTabChange("sandbox")}
              className={`qoe-devtools-tab-btn ${activeTab === "sandbox" ? "active" : ""}`}
            >
              💾 Sandbox
            </button>
            <button
              onClick={() => handleTabChange("impersonator")}
              className={`qoe-devtools-tab-btn ${activeTab === "impersonator" ? "active" : ""}`}
            >
              👤 Impersonate
            </button>
            <button
              onClick={() => handleTabChange("stats")}
              className={`qoe-devtools-tab-btn ${activeTab === "stats" ? "active" : ""}`}
            >
              📊 Live Stats
            </button>
          </div>

          {/* Drawer Body (Scrollable) */}
          <div className="qoe-devtools-body">
            {/* Transition Pending Overlay */}
            {isPending && (
              <div className="qoe-devtools-loading">
                <div className="qoe-devtools-spinner"></div>
                <span>Traitement Prisma / Supabase en cours...</span>
              </div>
            )}

            {/* Alert Box */}
            {alert && (
              <div className={`qoe-devtools-alert ${alert.type}`}>
                <span>{alert.message}</span>
                <button onClick={() => setAlert(null)} className="qoe-alert-close">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* TAB 1: QUICK JUMPER */}
            {activeTab === "jumper" && (
              <div className="qoe-devtools-tab-content">
                {/* Ports / Apps Links */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <Zap size={11} /> Switch Localhost Apps
                  </div>
                  <div className="qoe-devtools-grid">
                    {appLinks.map((link) => {
                      const isCurrent = typeof window !== "undefined" && window.location.port === link.port;
                      return (
                        <a
                          key={link.name}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="qoe-devtools-port-card"
                          style={isCurrent ? { border: "1px solid rgba(var(--devtools-accent), 0.8)", background: "rgba(var(--devtools-accent), 0.08)" } : {}}
                        >
                          <span className="qoe-devtools-port-name">
                            {link.icon} {link.name} {isCurrent && "📍"}
                          </span>
                          <span className="qoe-devtools-port-url">{link.url}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>

                {/* Subdomains / Dynamic Tenants list */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <Sparkles size={11} /> Local Subdomains (Tenants)
                  </div>
                  {creators.length === 0 ? (
                    <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", margin: "0 0 8px 0" }}>
                      Aucun créateur avec sous-domaine actif. Utilisez l&apos;onglet Sandbox pour en générer un !
                    </p>
                  ) : (
                    <div className="qoe-devtools-grid">
                      {creators.map((c) => {
                        const localSubdomainUrl = `http://${c.subdomain}.localhost:${ports.tenant}`;
                        return (
                          <div key={c.id} className="qoe-devtools-port-card" style={{ gap: "6px" }}>
                            <span className="qoe-devtools-port-name" style={{ color: c.accentColor || "#c5a880" }}>
                              ✍️ {c.name || c.username}
                            </span>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              <a
                                href={localSubdomainUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="qoe-devtools-copy-btn"
                                style={{ textDecoration: "none", color: "inherit", display: "inline-flex", alignItems: "center", gap: "2px" }}
                              >
                                Visiter <ExternalLink size={8} />
                              </a>
                              <span className="qoe-devtools-badge">{c.layoutStyle || "minimal"}</span>
                            </div>
                            <span className="qoe-devtools-port-url" style={{ fontSize: "8px" }}>
                              {c.subdomain}.localhost:{ports.tenant}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: DATABASE SANDBOX (SEEDER & SIMULATOR) */}
            {activeTab === "sandbox" && (
              <div className="qoe-devtools-tab-content">
                {/* Fast Seeding buttons */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <Database size={11} /> Fast Database Seeding
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={handleSeedCompletePack}
                        disabled={isPending}
                        className="qoe-devtools-btn qoe-devtools-btn-success"
                        style={{ flex: 1 }}
                      >
                        <Sparkles size={12} /> Seed Pack Complet
                      </button>
                      <button
                        onClick={handleSeedThoughts}
                        disabled={isPending}
                        className="qoe-devtools-btn"
                        style={{ flex: 1 }}
                      >
                        <Plus size={12} /> +15 Pensées Feed
                      </button>
                    </div>
                    <button
                      onClick={handleResetDatabase}
                      disabled={isPending}
                      className="qoe-devtools-btn qoe-devtools-btn-danger"
                    >
                      <Trash2 size={12} /> 🧹 Clean & Reset Database (Prisma)
                    </button>
                  </div>
                </div>

                {/* Simulated subscription builder */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <Mail size={11} /> Simuler un Abonné (Subscriber CRM)
                  </div>
                  <form onSubmit={handleSimulateSubscriber} className="qoe-devtools-form">
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Email de l&apos;abonné</label>
                      <input
                        type="email"
                        required
                        className="qoe-devtools-input"
                        placeholder="exemple@visiteur.com"
                        value={simSubscribe.email}
                        onChange={(e) => setSimSubscribe({ ...simSubscribe, email: e.target.value })}
                      />
                    </div>
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Créateur ciblé</label>
                      <select
                        required
                        className="qoe-devtools-select"
                        value={simSubscribe.creatorId}
                        onChange={(e) => setSimSubscribe({ ...simSubscribe, creatorId: e.target.value })}
                      >
                        <option value="">-- Choisir un créateur --</option>
                        {creators.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || c.username} ({c.subdomain})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <label style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={simSubscribe.isPremium}
                          onChange={(e) => setSimSubscribe({ ...simSubscribe, isPremium: e.target.checked })}
                        />
                        Abonnement payant (Premium)
                      </label>
                      {simSubscribe.isPremium && (
                        <select
                          className="qoe-devtools-select"
                          style={{ padding: "4px 8px" }}
                          value={simSubscribe.ltvCents}
                          onChange={(e) => setSimSubscribe({ ...simSubscribe, ltvCents: parseInt(e.target.value) })}
                        >
                          <option value="500">5.00 €</option>
                          <option value="1000">10.00 €</option>
                          <option value="2000">20.00 €</option>
                        </select>
                      )}
                    </div>
                    <button type="submit" disabled={isPending} className="qoe-devtools-btn">
                      <Plus size={10} /> Générer l&apos;Abonnement
                    </button>
                  </form>
                </div>

                {/* Simulated follow builder */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <Users size={11} /> Simuler un Follow (Feed Followers)
                  </div>
                  <form onSubmit={handleSimulateFollow} className="qoe-devtools-form">
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Abonné (Lecteur)</label>
                      <select
                        required
                        className="qoe-devtools-select"
                        value={simFollow.readerId}
                        onChange={(e) => setSimFollow({ ...simFollow, readerId: e.target.value })}
                      >
                        <option value="">-- Choisir un utilisateur --</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.username} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Créateur suivi</label>
                      <select
                        required
                        className="qoe-devtools-select"
                        value={simFollow.creatorId}
                        onChange={(e) => setSimFollow({ ...simFollow, creatorId: e.target.value })}
                      >
                        <option value="">-- Choisir le créateur --</option>
                        {creators.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || c.username}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" disabled={isPending} className="qoe-devtools-btn">
                      🤝 Lancer le Follow
                    </button>
                  </form>
                </div>

                {/* Simulate Wallet funds */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <Coins size={11} /> Simuler Portefeuille & Fonds
                  </div>
                  <form onSubmit={handleSimulateWallet} className="qoe-devtools-form">
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Utilisateur</label>
                      <select
                        required
                        className="qoe-devtools-select"
                        value={simWallet.userId}
                        onChange={(e) => setSimWallet({ ...simWallet, userId: e.target.value })}
                      >
                        <option value="">-- Sélectionner l&apos;utilisateur --</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.username} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Montant (en Euros, positif ou négatif)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        className="qoe-devtools-input"
                        value={simWallet.amountEuros}
                        onChange={(e) => setSimWallet({ ...simWallet, amountEuros: e.target.value })}
                        placeholder="Ex: 50.00 ou -10.00"
                      />
                    </div>
                    <button type="submit" disabled={isPending} className="qoe-devtools-btn qoe-devtools-btn-success">
                      <Coins size={10} /> Ajuster le Solde Portefeuille
                    </button>
                  </form>
                </div>

                {/* Custom Creator Generator */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <UserPlus size={11} /> Nouveau Créateur Virtuel
                  </div>
                  <form onSubmit={handleCreateCreator} className="qoe-devtools-form">
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Nom Complet *</label>
                      <input
                        type="text"
                        required
                        placeholder="Jean Philosophe"
                        className="qoe-devtools-input"
                        value={creatorForm.name}
                        onChange={(e) => setCreatorForm({ ...creatorForm, name: e.target.value })}
                      />
                    </div>
                    <div className="qoe-devtools-grid">
                      <div className="qoe-devtools-input-group">
                        <label className="qoe-devtools-label">Email *</label>
                        <input
                          type="email"
                          required
                          placeholder="jean@qoe.fi"
                          className="qoe-devtools-input"
                          value={creatorForm.email}
                          onChange={(e) => setCreatorForm({ ...creatorForm, email: e.target.value })}
                        />
                      </div>
                      <div className="qoe-devtools-input-group">
                        <label className="qoe-devtools-label">Username *</label>
                        <input
                          type="text"
                          required
                          placeholder="jean"
                          className="qoe-devtools-input"
                          value={creatorForm.username}
                          onChange={(e) => setCreatorForm({ ...creatorForm, username: e.target.value.toLowerCase().trim() })}
                        />
                      </div>
                    </div>
                    <div className="qoe-devtools-grid">
                      <div className="qoe-devtools-input-group">
                        <label className="qoe-devtools-label">Sous-domaine *</label>
                        <input
                          type="text"
                          required
                          placeholder="jean-philo"
                          className="qoe-devtools-input"
                          value={creatorForm.subdomain}
                          onChange={(e) => setCreatorForm({ ...creatorForm, subdomain: e.target.value.toLowerCase().trim() })}
                        />
                      </div>
                      <div className="qoe-devtools-input-group">
                        <label className="qoe-devtools-label">Couleur Accentuation</label>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <input
                            type="color"
                            className="qoe-devtools-input"
                            style={{ width: "32px", padding: 0, height: "26px", cursor: "pointer" }}
                            value={creatorForm.accentColor}
                            onChange={(e) => setCreatorForm({ ...creatorForm, accentColor: e.target.value })}
                          />
                          <input
                            type="text"
                            className="qoe-devtools-input"
                            style={{ flex: 1, fontSize: "9px" }}
                            value={creatorForm.accentColor}
                            onChange={(e) => setCreatorForm({ ...creatorForm, accentColor: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Style de Template</label>
                      <select
                        className="qoe-devtools-select"
                        value={creatorForm.layoutStyle}
                        onChange={(e) => setCreatorForm({ ...creatorForm, layoutStyle: e.target.value })}
                      >
                        <option value="minimal">Minimaliste (Pure & Purifié)</option>
                        <option value="magazine">Magazine (Édition structurée)</option>
                        <option value="brutalist">Brutaliste (Moderne, contrasté, néon)</option>
                      </select>
                    </div>
                    <button type="submit" disabled={isPending} className="qoe-devtools-btn">
                      🚀 Créer & Seeder le Créateur
                    </button>
                  </form>
                </div>

                {/* Custom Reader Generator */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <UserPlus size={11} /> Nouveau Lecteur Virtuel
                  </div>
                  <form onSubmit={handleCreateReader} className="qoe-devtools-form">
                    <div className="qoe-devtools-input-group">
                      <label className="qoe-devtools-label">Nom Complet</label>
                      <input
                        type="text"
                        required
                        placeholder="Sophie Curieuse"
                        className="qoe-devtools-input"
                        value={readerForm.name}
                        onChange={(e) => setReaderForm({ ...readerForm, name: e.target.value })}
                      />
                    </div>
                    <div className="qoe-devtools-grid">
                      <div className="qoe-devtools-input-group">
                        <label className="qoe-devtools-label">Email</label>
                        <input
                          type="email"
                          required
                          placeholder="sophie@gmail.com"
                          className="qoe-devtools-input"
                          value={readerForm.email}
                          onChange={(e) => setReaderForm({ ...readerForm, email: e.target.value })}
                        />
                      </div>
                      <div className="qoe-devtools-input-group">
                        <label className="qoe-devtools-label">Username</label>
                        <input
                          type="text"
                          required
                          placeholder="sophie"
                          className="qoe-devtools-input"
                          value={readerForm.username}
                          onChange={(e) => setReaderForm({ ...readerForm, username: e.target.value.toLowerCase().trim() })}
                        />
                      </div>
                    </div>
                    <button type="submit" disabled={isPending} className="qoe-devtools-btn">
                      🚀 Créer le Lecteur
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 3: IMPERSONATOR & SESSIONS */}
            {activeTab === "impersonator" && (
              <div className="qoe-devtools-tab-content">
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title" style={{ display: "flex", justifyContent: "between", alignItems: "center", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Users size={11} /> Mock Accounts Swapper
                    </div>
                    <button
                      onClick={handleLogout}
                      disabled={isPending}
                      className="qoe-devtools-copy-btn"
                      style={{ border: "1px solid rgba(239,68,68,0.4)", color: "rgb(239,68,68)" }}
                    >
                      🚪 Se déconnecter de tout
                    </button>
                  </div>

                  <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", margin: "0 0 12px 0" }}>
                    Un clic sur 🔑 connecte le navigateur instantanément à ce compte (mot de passe universel: <code style={{ color: "#c5a880" }}>password123</code>).
                  </p>

                  <div className="qoe-devtools-user-list">
                    {users.length === 0 ? (
                      <p style={{ textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.3)", padding: "20px 0" }}>
                        Aucun utilisateur enregistré localement.
                      </p>
                    ) : (
                      users.map((user) => {
                        const isCopied = copiedId === user.id;
                        return (
                          <div key={user.id} className="qoe-devtools-user-row">
                            <div className="qoe-devtools-user-info">
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span className="qoe-devtools-user-name">{user.name || user.username || "Sans nom"}</span>
                                <span className={`qoe-devtools-badge ${user.role}`}>
                                  {user.role}
                                </span>
                              </div>
                              <span className="qoe-devtools-user-meta">{user.email}</span>
                              {user.subdomain && (
                                <span className="qoe-devtools-user-meta" style={{ color: "rgba(var(--devtools-accent), 0.7)" }}>
                                  🌐 {user.subdomain}.localhost
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                onClick={() => copyToClipboard(user.email, user.id)}
                                className="qoe-devtools-copy-btn"
                                title="Copier l'email"
                              >
                                {isCopied ? <Check size={10} style={{ color: "#22c55e" }} /> : <Copy size={10} />}
                              </button>
                              <button
                                onClick={() => handleImpersonateLogin(user.email)}
                                disabled={isPending}
                                className="qoe-devtools-copy-btn"
                                style={{ border: "1px solid rgba(var(--devtools-accent), 0.4)", color: "rgb(var(--devtools-accent))" }}
                                title="Se connecter en tant que..."
                              >
                                🔑 Connexion
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: STATISTICS & DIAGNOSTICS */}
            {activeTab === "stats" && (
              <div className="qoe-devtools-tab-content">
                {/* DB Row Counters */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <Database size={11} /> Database Counter Stats
                  </div>
                  <div className="qoe-devtools-stats-grid">
                    <div className="qoe-devtools-stat-card">
                      <span className="qoe-devtools-stat-value">{stats.users}</span>
                      <span className="qoe-devtools-stat-label">Membres</span>
                    </div>
                    <div className="qoe-devtools-stat-card">
                      <span className="qoe-devtools-stat-value">{stats.articles}</span>
                      <span className="qoe-devtools-stat-label">Articles</span>
                    </div>
                    <div className="qoe-devtools-stat-card">
                      <span className="qoe-devtools-stat-value">{stats.posts}</span>
                      <span className="qoe-devtools-stat-label">Pensées</span>
                    </div>
                    <div className="qoe-devtools-stat-card">
                      <span className="qoe-devtools-stat-value">{stats.likes}</span>
                      <span className="qoe-devtools-stat-label">Likes</span>
                    </div>
                    <div className="qoe-devtools-stat-card">
                      <span className="qoe-devtools-stat-value">{stats.subscribers}</span>
                      <span className="qoe-devtools-stat-label">Abonnés CRM</span>
                    </div>
                    <button
                      onClick={refreshData}
                      disabled={isPending}
                      className="qoe-devtools-stat-card"
                      style={{ cursor: "pointer", background: "rgba(var(--devtools-accent), 0.05)", border: "1px solid rgba(var(--devtools-accent), 0.2)" }}
                    >
                      <span className="qoe-devtools-stat-value" style={{ display: "flex", justifyContent: "center" }}>
                        <RefreshCw size={14} className={isPending ? "qoe-spin-animation" : ""} />
                      </span>
                      <span className="qoe-devtools-stat-label" style={{ color: "rgb(var(--devtools-accent))" }}>Rafraîchir</span>
                    </button>
                  </div>
                </div>

                {/* Diagnostics Environment parameters */}
                <div className="qoe-devtools-section">
                  <div className="qoe-devtools-section-title">
                    <Activity size={11} /> Diagnostics & Environment
                  </div>
                  <div className="qoe-devtools-user-list" style={{ maxHeight: "none", fontSize: "10px", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Mode d&apos;exécution:</span>
                      <span style={{ color: "#22c55e", fontWeight: "bold" }}>development</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Navigateur Web Viewport:</span>
                      <span style={{ color: "#fff" }}>{screenSize}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Supabase URL:</span>
                      <span style={{ color: "#fff", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>
                        {process.env.NEXT_PUBLIC_SUPABASE_URL || "Non défini"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Prisma Studio:</span>
                      <span style={{ color: "#c5a880" }}>http://localhost:5555</span>
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
