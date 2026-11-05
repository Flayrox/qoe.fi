'use client';

import { useEffect, useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { LoginFormBento, LoginModal } from '@qoe/ui';
import { Button } from '@qoe/ui/button';
import { DefectList, Variant } from '../specimen-frame';

/**
 * Spécimen 20 — l'authentification, montée pour de vrai.
 *
 * 📖 Ce n'est pas une maquette : `LoginFormBento` est le composant qui sert
 *    core et tenants. Le monter ici rend visibles les écarts que le contrat
 *    ne couvre pas encore (champs, boutons OAuth, densité du CTA).
 *
 * ⚠️ Le composant est monté après hydratation : il construit un client
 *    Supabase au rendu et interroge `/v1/home/config`. Le montage différé
 *    évite d'exécuter tout ça côté serveur, sans rien changer au rendu réel.
 */
export function AuthSpecimen() {
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="grid gap-10">
      <Variant
        label="Le formulaire, monté pour de vrai"
        kind="actuel"
        hint="Le plateau vermillon, la colonne de marque et la connexion par lien magique par défaut — tels quels, dans core comme dans tenants. Aucune donnée n’est envoyée, aucun compte n’est créé."
      >
        <div className="overflow-hidden rounded-3xl">
          {mounted ? (
            <LoginFormBento initialMode="login" />
          ) : (
            <div className="h-[620px] rounded-3xl bg-muted/30" aria-hidden />
          )}
        </div>

        <DefectList
          items={[
            'Les champs sont des <input> bruts : 40 px de haut, rayon 12 px, hors des densités du contrat',
            'Le CTA primaire porte h-control-xl, une densité que le contrat refuse explicitement',
            'Les fournisseurs OAuth sont des <button> faits main, sans l’anneau de focus partagé',
            'L’accès privé (email d’invitation + « Vérifier ») réintroduit deux éléments bruts à côté des champs',
          ]}
        />
      </Variant>

      <Variant
        label="Création de compte — la friction est optionnelle"
        kind="candidat"
        hint="Même composant, mode inscription : nom, identifiant, email et mot de passe. Le bloc « votre profil » reste replié ; la démographie est proposée, jamais imposée."
      >
        <div className="overflow-hidden rounded-3xl">
          {mounted ? (
            <LoginFormBento initialMode="signup" />
          ) : (
            <div className="h-[620px] rounded-3xl bg-muted/30" aria-hidden />
          )}
        </div>

        <DefectList
          items={[
            'Le dépliant « Votre profil » porte aria-expanded mais pas aria-controls : il n’annonce pas la région qu’il ouvre',
            'Les suggestions de pronoms sont des boutons qui écrasent le champ au lieu de l’alimenter',
          ]}
        />
      </Variant>

      <Variant
        label="La variante compacte — pour une popup"
        kind="candidat"
        hint="Même formulaire, même état, mêmes validations : une seule carte, sans plateau ni colonne de manifeste. C’est ce que monte LoginModal ; la page /login garde le bento 55/45."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
          <div className="rounded-panel border border-dashed border-border/60 bg-muted/20 p-3">
            <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              popup · max-w-md
            </p>
            {mounted ? (
              <LoginFormBento variant="compact" initialMode="login" />
            ) : (
              <div className="h-[460px] rounded-2xl bg-muted/30" aria-hidden />
            )}
          </div>

          <DefectList
            items={[
              'Le bento 55/45 ne tient pas dans une popup : à 620 px de haut et deux colonnes, la modale finissait en 5xl et la colonne de marque volait le regard',
              'La variante compacte ne rend pas le manifeste du tout — pas de rotation, pas de minuterie, dans une fenêtre où l’on vient pour se connecter',
              'Un seul conteneur à maintenir : le contenu du formulaire est rendu une fois, le cadre change (carte seule ou plateau)',
            ]}
          />
        </div>
      </Variant>

      <Variant
        label="La modale — un dialogue nommé autour du formulaire"
        kind="candidat"
        hint="LoginModal est un Dialog du contrat — role=dialog, aria-modal, Échap, clic extérieur, focus rendu au déclencheur — qui monte la variante compacte. Ouvrez-la pour la voir en vrai ; la capture garde le spécimen au repos."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="solid" tone="brand" onClick={() => setModalOpen(true)}>
            <LogIn /> Ouvrir la modale
          </Button>
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
            <ShieldCheck className="size-3.5" strokeWidth={1.5} />
            role=dialog · aria-modal · Échap
          </span>
        </div>

        <LoginModal isOpen={modalOpen} onClose={() => setModalOpen(false)} initialMode="login" />

        <DefectList
          items={[
            'Le titre accessible est en sr-only : la modale est nommée « Se connecter » sans afficher un second titre',
            'La fermeture est un Button du contrat, doublé du clic extérieur et d’Échap',
            'La colonne de marque tourne toutes les 6 s ; elle ne s’arrête que si l’OS demande moins d’animation',
          ]}
        />
      </Variant>
    </div>
  );
}
