"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
  Check,
  X,
  ShieldAlert,
  Loader2,
  ExternalLink,
  Search,
  MessageSquare,
  Shield,
  Key,
  Calendar,
  AlertCircle
} from "lucide-react"
import { updateCreatorApiAccessAction } from "@qoe/api-client/actions/admin"


export interface ApiApplicant {
  id: string
  name: string | null
  email: string
  subdomain: string | null
  apiAccessStatus: string
  apiApplicationReason: string | null
  createdAt: string
  updatedAt: string
}

interface ApiRequestsClientProps {
  initialApplicants: ApiApplicant[]
}

export function ApiRequestsClient({ initialApplicants }: ApiRequestsClientProps) {
  const [applicants, setApplicants] = useState<ApiApplicant[]>(initialApplicants)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null)

  const handleUpdateStatus = async (userId: string, newStatus: "approved" | "rejected" | "revoked" | "none") => {
    setLoadingId(userId)
    try {
      const res = await updateCreatorApiAccessAction({ userId, status: newStatus })
      if (res.ok) {

        setApplicants(
          applicants.map((app) =>
            app.id === userId ? { ...app, apiAccessStatus: newStatus } : app
          )
        )
        toast.success(`Statut mis à jour avec succès : ${newStatus}`)
      }
    } catch (error: any) {
      toast.error(error.message || "Impossible de mettre à jour le statut.")
    } finally {
      setLoadingId(null)
    }
  }

  // Filter and search logic
  const filteredApplicants = applicants.filter((app) => {
    const matchesStatus =
      filterStatus === "all" || app.apiAccessStatus === filterStatus
    const matchesSearch =
      (app.name && app.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      app.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.subdomain && app.subdomain.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesStatus && matchesSearch
  })

  return (
    <div className="space-y-8 text-neutral-800 font-sans">
      
      {/* Search & Filter bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "Tous" },
            { id: "pending", label: "En attente (Pending)" },
            { id: "approved", label: "Approuvés" },
            { id: "rejected", label: "Rejetés" },
            { id: "revoked", label: "Révoqués" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
                filterStatus === tab.id
                  ? "bg-[#EE4B2B] text-white border-[#EE4B2B] shadow-sm"
                  : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher un créateur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-white border border-neutral-200 rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:border-[#EE4B2B] focus:ring-[#EE4B2B]/20 transition-all placeholder:text-neutral-400"
          />
        </div>
      </div>

      {/* Grid or Table */}
      <div className="bg-white border border-neutral-150 rounded-3xl overflow-hidden shadow-sm">
        {filteredApplicants.length === 0 ? (
          <div className="p-16 text-center text-neutral-400 space-y-3">
            <Shield className="w-10 h-10 text-neutral-300 mx-auto" />
            <p className="text-sm font-semibold">Aucune demande trouvée</p>
            <p className="text-xs text-neutral-400">Ajustez vos filtres ou effectuez une autre recherche.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-150 text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                  <th className="px-6 py-4">Créateur</th>
                  <th className="px-6 py-4">Espace (Subdomain)</th>
                  <th className="px-6 py-4">Cas d'usage</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                <AnimatePresence mode="popLayout">
                  {filteredApplicants.map((app) => (
                    <motion.tr
                      key={app.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-neutral-50/50 transition-colors align-top"
                    >
                      {/* Creator Identity */}
                      <td className="px-6 py-5">
                        <div className="space-y-0.5">
                          <span className="font-bold text-neutral-900 block">
                            {app.name || "Créateur Sans Nom"}
                          </span>
                          <span className="text-[11px] text-neutral-400 block font-mono">
                            {app.email}
                          </span>
                        </div>
                      </td>

                      {/* Subdomain */}
                      <td className="px-6 py-5">
                        {app.subdomain ? (
                          <a
                            href={`https://${app.subdomain}.qoe.fi`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-neutral-600 hover:text-[#EE4B2B] hover:underline flex items-center gap-1 inline-flex"
                          >
                            {app.subdomain}.qoe.fi
                            <ExternalLink className="w-3 h-3 text-neutral-400" />
                          </a>
                        ) : (
                          <span className="text-neutral-400">Aucun</span>
                        )}
                      </td>

                      {/* Usage Justification */}
                      <td className="px-6 py-5 max-w-sm">
                        {app.apiApplicationReason ? (
                          <div className="space-y-2">
                            <p
                              className={`text-neutral-600 leading-relaxed font-mono text-[11px] ${
                                expandedReasonId === app.id ? "" : "line-clamp-2"
                              }`}
                            >
                              {app.apiApplicationReason}
                            </p>
                            <button
                              onClick={() =>
                                setExpandedReasonId(
                                  expandedReasonId === app.id ? null : app.id
                                )
                              }
                              className="text-[10px] font-bold text-[#EE4B2B] hover:underline flex items-center gap-0.5"
                            >
                              {expandedReasonId === app.id ? "Replier" : "Voir tout l'usage"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-neutral-400 italic">Pas de cas d'usage fourni</span>
                        )}
                      </td>

                      {/* Access Status Badge */}
                      <td className="px-6 py-5">
                        <div className="pt-0.5">
                          {app.apiAccessStatus === "none" && (
                            <span className="bg-neutral-100 text-neutral-600 border border-neutral-200 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                              None
                            </span>
                          )}
                          {app.apiAccessStatus === "pending" && (
                            <span className="bg-amber-50 text-amber-600 border border-amber-200/50 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 inline-flex">
                              <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                              Pending
                            </span>
                          )}
                          {app.apiAccessStatus === "approved" && (
                            <span className="bg-emerald-50 text-emerald-600 border border-emerald-200/50 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 inline-flex">
                              <span className="w-1 h-1 rounded-full bg-emerald-500" />
                              Approved
                            </span>
                          )}
                          {app.apiAccessStatus === "rejected" && (
                            <span className="bg-red-50 text-red-600 border border-red-200/50 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              Rejected
                            </span>
                          )}
                          {app.apiAccessStatus === "revoked" && (
                            <span className="bg-red-50 text-red-600 border border-red-200/50 px-2 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 inline-flex">
                              Revoked
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Interactive Management Buttons */}
                      <td className="px-6 py-4 text-right">
                        {loadingId === app.id ? (
                          <div className="flex justify-end pr-4">
                            <Loader2 className="w-4 h-4 animate-spin text-[#EE4B2B]" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Actions when Pending */}
                            {app.apiAccessStatus === "pending" && (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(app.id, "approved")}
                                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-3 py-1.5 rounded-xl shadow-sm transition-all"
                                >
                                  Approuver
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(app.id, "rejected")}
                                  className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold px-3 py-1.5 rounded-xl transition-all"
                                >
                                  Refuser
                                </button>
                              </>
                            )}

                            {/* Actions when Approved */}
                            {app.apiAccessStatus === "approved" && (
                              <button
                                onClick={() => handleUpdateStatus(app.id, "revoked")}
                                className="bg-neutral-50 hover:bg-red-50 hover:text-red-600 border border-neutral-200 text-neutral-600 font-semibold px-3 py-1.5 rounded-xl transition-all"
                              >
                                Révoquer l'accès
                              </button>
                            )}

                            {/* Actions when Rejected, Revoked or None */}
                            {(app.apiAccessStatus === "rejected" ||
                              app.apiAccessStatus === "revoked" ||
                              app.apiAccessStatus === "none") && (
                              <button
                                onClick={() => handleUpdateStatus(app.id, "approved")}
                                className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold px-3 py-1.5 rounded-xl shadow-sm transition-all"
                              >
                                Activer l'accès API
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
