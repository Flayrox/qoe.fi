'use client';

import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '@qoe/sdk';
import {
  Loader2,
  Heart,
  MessageCircle,
  AtSign,
  UserPlus,
  Repeat,
  Building2,
  UsersRound,
} from 'lucide-react';

export function NotificationSettingsForm() {
  const { data: prefs, isLoading } = useNotificationPreferencesQuery();
  const updateMutation = useUpdateNotificationPreferencesMutation();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mb-2 text-primary" />
        <p className="text-sm">Chargement de vos préférences...</p>
      </div>
    );
  }

  const handleToggle = (key: PreferenceKey, value: boolean) => {
    updateMutation.mutate({ [key]: value });
  };

  const sections = [
    {
      title: "J'aime & Réactions",
      icon: Heart,
      iconColor: 'text-destructive',
      emailKey: 'emailLikes',
      pushKey: 'pushLikes',
      description: "Alertes lorsque quelqu'un aime l'une de vos pensées ou publications.",
    },
    {
      title: 'Réponses & Thread',
      icon: MessageCircle,
      iconColor: 'text-primary',
      emailKey: 'emailReplies',
      pushKey: 'pushReplies',
      description: "Alertes lorsqu'un membre répond directement à votre pensée.",
    },
    {
      title: 'Mentions',
      icon: AtSign,
      iconColor: 'text-highlight',
      emailKey: 'emailMentions',
      pushKey: 'pushMentions',
      description: "Alertes lorsque votre nom d'utilisateur (@username) est cité.",
    },
    {
      title: 'Abonnements',
      icon: UserPlus,
      iconColor: 'text-primary',
      emailKey: 'emailFollows',
      pushKey: 'pushFollows',
      description: "Alertes lorsqu'un nouveau lecteur s'abonne à votre profil.",
    },
    {
      title: 'Repartages / Reposts',
      icon: Repeat,
      iconColor: 'text-success',
      emailKey: 'emailReposts',
      pushKey: 'pushReposts',
      description: "Alertes lorsqu'un membre republie votre pensée sur son fil.",
    },
    {
      title: 'Commentaires d’articles',
      icon: MessageCircle,
      iconColor: 'text-primary',
      emailKey: 'emailComments',
      pushKey: 'pushComments',
      description: "Alertes lorsqu'un lecteur commente l'un de vos écrits publiés.",
    },
    {
      title: 'Activité des Médias',
      icon: Building2,
      iconColor: 'text-highlight',
      emailKey: 'emailMedia',
      pushKey: 'pushMedia',
      description:
        'Invitations à rejoindre un Média, arrivées de membres, nouvelles publications de vos Médias.',
    },
    {
      title: 'Collaborations & attributions',
      icon: UsersRound,
      iconColor: 'text-primary',
      emailKey: 'emailCollaborations',
      pushKey: 'pushCollaborations',
      description:
        'Invitations à signer un article, acceptations, refus et retraits de consentement.',
    },
  ] as const;

  type EmailKey = (typeof sections)[number]['emailKey'];
  type PushKey = (typeof sections)[number]['pushKey'];
  type PreferenceKey = EmailKey | PushKey;

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-6">
      <div className="border-b border-border pb-4">
        <h2 className="text-xl font-bold text-foreground">Préférences de Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Personnalisez la façon dont vous souhaitez être informé des activités sur votre réseau.
        </p>
      </div>

      <div className="space-y-6">
        {sections.map((section) => {
          const Icon = section.icon;
          const emailVal = prefs?.[section.emailKey] ?? true;
          const pushVal = prefs?.[section.pushKey] ?? true;

          return (
            <div
              key={section.title}
              className="p-4 bg-card border border-border rounded-xl space-y-3 transition-colors hover:border-border/80"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-muted ${section.iconColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-base">{section.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={pushVal}
                    onChange={(e) => handleToggle(section.pushKey, e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                  <span>Notifications App / Push</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={emailVal}
                    onChange={(e) => handleToggle(section.emailKey, e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-primary"
                  />
                  <span>Alertes Email</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
