import { Href, Link } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { type ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

// Lien externe : ouvre une URL dans le navigateur in-app (SFSafariViewController
// sur iOS / Custom Tabs sur Android) au lieu de quitter l'app. Sur le web,
// comportement standard (<a target="_blank">).
// ⚠️ `WebBrowserPresentationStyle.AUTOMATIC` : le navigateur in-app choisit
//    automatiquement la présentation (page pleine vs sheet) selon le contexte.
export function ExternalLink({ href, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== 'web') {
          // Empêche l'ouverture du navigateur système par défaut (natif).
          event.preventDefault();
          // Ouvre le lien dans un navigateur in-app.
          await openBrowserAsync(href, {
            presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
          });
        }
      }}
    />
  );
}
