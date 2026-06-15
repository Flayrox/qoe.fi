import { prisma } from "@qoe/db/client"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, User as UserIcon, Mail, ShieldCheck, Activity, Euro, Users, BookOpen } from "lucide-react"

interface PageProps {
  params: {
    id: string
  }
}

export default async function UserProfilePage({ params }: PageProps) {
  const { id } = await params;
  
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          articles: true,
          subscribers: true,
          walletTransactions: true,
        }
      }
    }
  })

  if (!user) {
    notFound()
  }

  // Calculate some intelligence metrics
  // In a real app, this would use aggregated queries
  const revenueCents = await prisma.walletTransaction.aggregate({
    where: { userId: user.id, type: 'SUBSCRIPTION_PAYMENT' },
    _sum: { amountCents: true }
  })
  
  const totalRevenue = (revenueCents._sum.amountCents || 0) / 100;
  const ltv = user._count.subscribers > 0 ? (totalRevenue / user._count.subscribers).toFixed(2) : "0.00";

  return (
    <div className="max-w-4xl mx-auto space-y-8 font-sans">
      <div className="flex items-center gap-4 mb-8">
        <Link 
          href="/admin/users" 
          className="p-2.5 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-xl text-neutral-500 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-3">
            Creator Intelligence
            {user.isCertified && <ShieldCheck className="w-5 h-5 text-blue-500" />}
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">Vue détaillée des performances de l'utilisateur.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="bg-white border border-neutral-200/60 rounded-[24px] p-6 shadow-sm md:col-span-1 space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-gradient-to-tr from-[#EE4B2B] to-orange-400 text-white rounded-full flex items-center justify-center text-2xl font-bold mb-4 shadow-md">
              {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-neutral-900">{user.name || "Sans nom"}</h2>
            <p className="text-neutral-500 text-sm font-mono flex items-center gap-1.5 mt-1">
              <Mail className="w-3 h-3" /> {user.email}
            </p>
            <div className="mt-4 px-3 py-1 bg-neutral-100 text-neutral-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
              {user.role}
            </div>
          </div>
          
          <div className="pt-6 border-t border-neutral-100 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500">Statut</span>
              {user.isSuspended ? (
                <span className="font-semibold text-red-500">Banni</span>
              ) : user.isShadowbanned ? (
                <span className="font-semibold text-amber-500">Shadowbanned</span>
              ) : (
                <span className="font-semibold text-emerald-500">Actif</span>
              )}
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500">Inscrit le</span>
              <span className="font-medium text-neutral-900">{user.createdAt.toLocaleDateString('fr-FR')}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500">Domaine</span>
              <span className="font-medium text-neutral-900">{user.subdomain ? `${user.subdomain}.qoe.fi` : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-white border border-neutral-200/60 rounded-[24px] p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2 text-neutral-500">
              <Users className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Abonnés Totaux</h3>
            </div>
            <div className="text-4xl font-bold text-neutral-900 tracking-tight">{user._count.subscribers}</div>
          </div>
          
          <div className="bg-white border border-neutral-200/60 rounded-[24px] p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2 text-neutral-500">
              <BookOpen className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Articles Publiés</h3>
            </div>
            <div className="text-4xl font-bold text-neutral-900 tracking-tight">{user._count.articles}</div>
          </div>
          
          <div className="bg-white border border-neutral-200/60 rounded-[24px] p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2 text-neutral-500">
              <Euro className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Revenus Générés</h3>
            </div>
            <div className="text-4xl font-bold text-neutral-900 tracking-tight">{totalRevenue.toFixed(2)} €</div>
          </div>
          
          <div className="bg-white border border-neutral-200/60 rounded-[24px] p-6 shadow-sm flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2 text-neutral-500">
              <Activity className="w-4 h-4" />
              <h3 className="text-sm font-semibold">LTV Moyen / Abonné</h3>
            </div>
            <div className="text-4xl font-bold text-neutral-900 tracking-tight">{ltv} €</div>
          </div>
        </div>
      </div>
    </div>
  )
}
