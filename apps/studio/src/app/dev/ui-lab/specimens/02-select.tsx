'use client';

import { useState } from 'react';
import { Building2, FileText, Globe, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@qoe/ui/ui/select';
import { DefectList, Variant } from '../specimen-frame';

const ROLES = {
  editor: 'Éditeur',
  writer: 'Auteur·rice',
  admin: 'Administrateur·rice',
  reader: 'Lecteur·rice',
};

const VISIBILITY = {
  public: 'Public',
  unlisted: 'Non répertorié',
  private: 'Privé',
};

export function SelectSpecimen() {
  const [role, setRole] = useState<string | null>('editor');
  const [visibility, setVisibility] = useState<string | null>('public');

  return (
    <div className="grid gap-10">
      <Variant
        label="Primitive actuelle"
        kind="actuel"
        hint="Rendu réel de @qoe/ui/ui/select (Base UI). La primitive existe mais n’a aujourd’hui aucun call-site dans les apps : c’est sa première mise en situation réelle."
      >
        <div className="flex flex-wrap items-start gap-6">
          <Field label="Rôle" hint="Taille par défaut (h-8)">
            <Select items={ROLES} value={role} onValueChange={(v) => setRole(v as string)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Choisir un rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Équipe éditoriale</SelectLabel>
                  <SelectItem value="editor">Éditeur</SelectItem>
                  <SelectItem value="writer">Auteur·rice</SelectItem>
                  <SelectItem value="admin">Administrateur·rice</SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectItem value="reader">Lecteur·rice</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Taille compacte" hint='size="sm" (h-7)'>
            <Select
              items={VISIBILITY}
              value={visibility}
              onValueChange={(v) => setVisibility(v as string)}
            >
              <SelectTrigger size="sm" className="w-44">
                <Globe className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="unlisted">Non répertorié</SelectItem>
                <SelectItem value="private">Privé</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Désactivé" hint="disabled — 40 % d’opacité">
            <Select disabled value="private">
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Privé</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DefectList
          items={[
            'Aucun usage dans les apps : le comportement n’a jamais été confronté à un écran réel',
            'Conteneur en rounded-lg + shadow-md, alors que DropdownMenu est en rounded-[20px] + shadow-xl',
            'Pas de variante “avec icône à gauche” documentée : chaque call-site réinvente le trigger',
          ]}
        />
      </Variant>

      <Variant
        label="Candidat — aligné sur le menu densifié"
        kind="candidat"
        hint="Même trigger, mais hauteur et rayons alignés sur l’échelle du thème, et un état de repos identique au bouton outline du Studio pour que le champ et le bouton voisin aient la même masse visuelle."
      >
        <div className="flex flex-wrap items-start gap-6">
          <Field label="Rôle" hint="h-8, rounded-lg, ring au focus">
            <Select items={ROLES} value={role} onValueChange={(v) => setRole(v as string)}>
              <SelectTrigger className="h-8 w-52 rounded-lg border-border/60 bg-card">
                <Users className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                <SelectValue placeholder="Choisir un rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Éditeur</SelectItem>
                <SelectItem value="writer">Auteur·rice</SelectItem>
                <SelectItem value="admin">Administrateur·rice</SelectItem>
                <SelectItem value="reader">Lecteur·rice</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Publisher" hint="icône + libellé, largeur fixe">
            <Select items={{ climat: 'Climat', atelier: 'Atelier Nord' }} defaultValue="climat">
              <SelectTrigger className="h-8 w-48 rounded-lg border-border/60 bg-card">
                <Building2 className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="climat">Climat</SelectItem>
                <SelectItem value="atelier">Atelier Nord</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Type d’article" hint="second niveau de la hiérarchie">
            <Select
              items={{ note: 'Note', essai: 'Essai', dossier: 'Dossier' }}
              defaultValue="essai"
            >
              <SelectTrigger className="h-8 w-44 rounded-lg border-border/60 bg-card">
                <FileText className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="essai">Essai</SelectItem>
                <SelectItem value="dossier">Dossier</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Variant>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground/80">{hint}</span>}
    </div>
  );
}
