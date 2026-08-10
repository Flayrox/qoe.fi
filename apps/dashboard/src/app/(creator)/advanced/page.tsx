"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Users, CheckCircle2, XCircle, Clock, UserPlus, Sliders, ShieldCheck, Mail, ArrowRight, Loader2, Sparkles } from "lucide-react"
import {
  getCollaborationRequestsAction,
  respondToCollaborationRequestAction,
  sendCollaborationRequestAction
} from "./actions"
import { createMediaAction, inviteMediaMemberAction } from "../media/actions"

export default function CreatorAdvancedPage() {
  const [requests, setRequests] = useState<{ received: any[]; sent: any[] }>({ received: [], sent: [] })
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteArticleId, setInviteArticleId] = useState("")
  const [sendingInvite, setSendingInvite] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // Media Creation State
  const [mediaName, setMediaName] = useState("")
  const [mediaSlug, setMediaSlug] = useState("")
  const [mediaBio, setMediaBio] = useState("")
  const [creatingMedia, setCreatingMedia] = useState(false)
  const [mediaMsg, setMediaMsg] = useState<string | null>(null)

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    setLoading(true)
    const res = await getCollaborationRequestsAction()
    if (res.success) {
      setRequests({ received: res.received || [], sent: res.sent || [] })
    }
    setLoading(false)
  }

  const handleRespond = async (requestId: string, accept: boolean, showOnPublicProfile: boolean = true) => {
    const res = await respondToCollaborationRequestAction(requestId, accept, showOnPublicProfile)
    if (res.success) {
      setActionMsg(accept ? "✅ Invitation acceptée !" : "❌ Invitation refusée.")
      loadRequests()
    }
  }

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail || !inviteArticleId) return

    setSendingInvite(true)
    const res = await sendCollaborationRequestAction(inviteArticleId, inviteEmail)
    setSendingInvite(false)

    if (res.success) {
      setActionMsg("🎉 Invitation de co-rédaction envoyée avec succès !")
      setInviteEmail("")
      setInviteArticleId("")
      loadRequests()
    } else {
      setActionMsg(`⚠️ ${res.error}`)
    }
  }

  const handleCreateMedia = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mediaName || !mediaSlug) return

    setCreatingMedia(true)
    const res = await createMediaAction(mediaName, mediaSlug, mediaBio)
    setCreatingMedia(false)

    if (res.success) {
      setMediaMsg("🎉 Votre Profil Média a été créé ! Vous pouvez y basculer depuis le sélecteur de Workspace dans le header.")
      setMediaName("")
      setMediaSlug("")
      setMediaBio("")
    } else {
      setMediaMsg(`⚠️ ${res.error}`)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10 text-foreground">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
          <Sliders className="w-3.5 h-3.5" />
          <span>Espace Avancé & Collaboration</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Co-Édition, Demandes & Médias
        </h1>
        <p className="text-muted-foreground text-base max-w-2xl">
          Gérez vos demandes de co-rédaction, choisissez quels articles apparaissent sur votre profil public, et créez vos journaux collectifs.
        </p>
      </div>

      {actionMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 mb-8 bg-card border border-primary/30 text-foreground rounded-2xl flex items-center justify-between shadow-sm"
        >
          <span className="text-sm font-medium">{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-xs text-muted-foreground hover:text-foreground">
            Fermer
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Collaboration Requests Received */}
        <div className="bg-card border border-border/40 rounded-3xl p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Demandes Reçues</h2>
              <p className="text-xs text-muted-foreground">Invitations de co-rédaction reçues d'autres auteurs</p>
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Chargement des requêtes...</span>
            </div>
          ) : requests.received.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-border/40 rounded-2xl text-xs text-muted-foreground">
              Aucune demande de collaboration en attente.
            </div>
          ) : (
            <div className="space-y-4">
              {requests.received.map((req) => (
                <div key={req.id} className="p-4 rounded-2xl bg-muted/30 border border-border/40">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm text-foreground">{req.article?.title || 'Article'}</p>
                      <p className="text-xs text-muted-foreground">
                        De : <strong className="text-foreground">{req.inviter?.name || req.inviter?.email}</strong>
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      req.status === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-600' :
                      req.status === 'DECLINED' ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      {req.status}
                    </span>
                  </div>

                  {req.status === 'PENDING' && (
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/20">
                      <button
                        onClick={() => handleRespond(req.id, true, true)}
                        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Accepter</span>
                      </button>
                      <button
                        onClick={() => handleRespond(req.id, false)}
                        className="px-4 py-2 rounded-xl bg-muted text-muted-foreground hover:text-foreground font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Refuser</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invite Co-Author Form */}
        <div className="bg-card border border-border/40 rounded-3xl p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Inviter un Co-Auteur</h2>
              <p className="text-xs text-muted-foreground">Collaborez en temps réel sur l'un de vos écrits</p>
            </div>
          </div>

          <form onSubmit={handleSendInvite} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                ID de votre article (Draft/Article)
              </label>
              <input
                type="text"
                value={inviteArticleId}
                onChange={(e) => setInviteArticleId(e.target.value)}
                placeholder="Ex: cm123abc..."
                className="w-full p-3 rounded-xl bg-muted/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Email du co-auteur à inviter
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="coauteur@example.com"
                className="w-full p-3 rounded-xl bg-muted/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <button
              type="submit"
              disabled={sendingInvite}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {sendingInvite ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Envoyer la demande de co-rédaction</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Create Media Section */}
      <div className="bg-card border border-border/40 rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Créer un Profil Média / Journal Collectif</h2>
            <p className="text-xs text-muted-foreground">Créez une entité média indépendante avec son propre profil, sous-domaine et équipe d'auteurs.</p>
          </div>
        </div>

        {mediaMsg && (
          <div className="p-4 mb-6 bg-primary/10 border border-primary/20 text-foreground text-xs font-medium rounded-xl">
            {mediaMsg}
          </div>
        )}

        <form onSubmit={handleCreateMedia} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Nom du Média
            </label>
            <input
              type="text"
              value={mediaName}
              onChange={(e) => {
                setMediaName(e.target.value)
                setMediaSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
              }}
              placeholder="Ex: Le Clubic Indépendant"
              className="w-full p-3 rounded-xl bg-muted/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Permalien / Sous-domaine
            </label>
            <input
              type="text"
              value={mediaSlug}
              onChange={(e) => setMediaSlug(e.target.value)}
              placeholder="clubic-independant"
              className="w-full p-3 rounded-xl bg-muted/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Description / Bio du Média
            </label>
            <textarea
              value={mediaBio}
              onChange={(e) => setMediaBio(e.target.value)}
              placeholder="Revue collective dédiée aux enjeux de la transition numérique..."
              rows={3}
              className="w-full p-3 rounded-xl bg-muted/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="md:col-span-2 pt-2">
            <button
              type="submit"
              disabled={creatingMedia}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {creatingMedia ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Créer le Profil Média & Espace de Travail</span>
                  <Sparkles className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
