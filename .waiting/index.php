<?php
declare(strict_types=1);

$translations = [
    'en' => [
        'title' => 'qoe.fi is coming soon',
        'meta' => 'A bilingual, editorial waiting page shaped by the same calm, premium language as the rest of qoe.fi.',
        'eyebrow' => 'waiting room',
        'headline' => 'qoe.fi is coming soon.',
        'lede' => 'A quieter place for reading, writing, and publishing is being prepared with care.',
        'support' => 'The new experience will keep the tone of the project: restrained, sovereign, and focused on words.',
        'cta_primary' => 'Back to the main site',
        'cta_secondary' => 'Open the French version',
        'status_label' => 'Status',
        'status_value' => 'Under construction',
        'promise_label' => 'What stays',
        'promise_value' => 'Slow reading, clean writing, no visual noise',
        'tone_label' => 'Tone',
        'tone_value' => 'Minimal, warm, editorial',
        'panel_title' => 'What is being built',
        'panel_body' => 'A calm place for publications, highlights, and a more deliberate reading rhythm.',
        'panel_note' => 'Designed to feel like qoe.fi already belongs to the page, even before launch.',
        'footer_note' => 'Built in HTML, CSS, JS, and PHP for easy deployment.',
    ],
    'fr' => [
        'title' => 'qoe.fi arrive bientôt',
        'meta' => 'Une page d’attente bilingue, éditoriale et calme, dans la continuité visuelle de qoe.fi.',
        'eyebrow' => 'salle d’attente',
        'headline' => 'qoe.fi arrive bientôt.',
        'lede' => 'Un lieu plus calme pour lire, écrire et publier se prépare avec soin.',
        'support' => 'La nouvelle expérience gardera le ton du projet : sobre, souverain et centré sur les mots.',
        'cta_primary' => 'Retour au site principal',
        'cta_secondary' => 'Ouvrir la version anglaise',
        'status_label' => 'Statut',
        'status_value' => 'En construction',
        'promise_label' => 'Ce qui reste',
        'promise_value' => 'Lecture lente, écriture nette, zéro bruit visuel',
        'tone_label' => 'Tonalité',
        'tone_value' => 'Minimaliste, chaleureuse, éditoriale',
        'panel_title' => 'Ce qui se construit',
        'panel_body' => 'Un endroit apaisé pour les publications, les temps forts et un rythme de lecture plus posé.',
        'panel_note' => 'Conçu pour donner l’impression que qoe.fi a déjà sa place sur la page, même avant le lancement.',
        'footer_note' => 'Réalisé en HTML, CSS, JS et PHP pour un déploiement simple.',
    ],
];

$acceptLanguage = strtolower((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''));
$preferred = str_starts_with($acceptLanguage, 'fr') ? 'fr' : 'en';
$requested = strtolower((string)($_GET['lang'] ?? ''));
$lang = array_key_exists($requested, $translations) ? $requested : $preferred;
$copy = $translations[$lang];
$alt = $lang === 'fr' ? 'en' : 'fr';

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}
?>
<!doctype html>
<html lang="<?= e($lang) ?>" data-lang="<?= e($lang) ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#ffffff">
    <title><?= e($copy['title']) ?></title>
    <meta name="description" content="<?= e($copy['meta']) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="page-shell">
        <div class="ambient ambient-left"></div>
        <div class="ambient ambient-right"></div>
        <div class="grid-overlay"></div>

        <header class="topbar">
            <a class="brand" href="/" aria-label="qoe.fi">qoe.fi</a>
            <div class="language-switch" role="tablist" aria-label="Language switcher">
                <button type="button" class="lang-pill" data-lang-button="en" aria-pressed="<?= $lang === 'en' ? 'true' : 'false' ?>">EN</button>
                <button type="button" class="lang-pill" data-lang-button="fr" aria-pressed="<?= $lang === 'fr' ? 'true' : 'false' ?>">FR</button>
            </div>
        </header>

        <main class="waiting-layout">
            <section class="hero-card">
                <div class="hero-topline">
                    <span class="eyebrow"><?= e($copy['eyebrow']) ?></span>
                    <span class="status-chip" data-status-copy><?= e($copy['meta']) ?></span>
                </div>

                <div class="headline-stack">
                    <p class="section-kicker"><?= e($copy['status_label']) ?> <span>2026</span></p>
                    <h1 data-page-title><?= e($copy['headline']) ?></h1>
                    <p class="lede"><?= e($copy['lede']) ?></p>
                    <p class="support"><?= e($copy['support']) ?></p>
                </div>

                <div class="stat-grid" aria-label="Project details">
                    <div class="stat-card">
                        <span class="stat-label"><?= e($copy['status_label']) ?></span>
                        <strong class="stat-value"><?= e($copy['status_value']) ?></strong>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label"><?= e($copy['promise_label']) ?></span>
                        <strong class="stat-value"><?= e($copy['promise_value']) ?></strong>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label"><?= e($copy['tone_label']) ?></span>
                        <strong class="stat-value"><?= e($copy['tone_value']) ?></strong>
                    </div>
                </div>

                <div class="cta-row">
                    <a class="primary-link" href="/">
                        <span><?= e($copy['cta_primary']) ?></span>
                        <span aria-hidden="true">↗</span>
                    </a>
                    <button class="secondary-link" type="button" data-lang-button="<?= e($alt) ?>">
                        <span><?= e($copy['cta_secondary']) ?></span>
                    </button>
                </div>
            </section>

            <aside class="info-column">
                <section class="info-panel" data-lang-panel="en" <?= $lang === 'en' ? '' : 'hidden' ?>>
                    <p class="panel-tag">English</p>
                    <h2><?= e($translations['en']['panel_title']) ?></h2>
                    <p><?= e($translations['en']['panel_body']) ?></p>
                    <p class="panel-note"><?= e($translations['en']['panel_note']) ?></p>
                </section>

                <section class="info-panel" data-lang-panel="fr" <?= $lang === 'fr' ? '' : 'hidden' ?>>
                    <p class="panel-tag">Français</p>
                    <h2><?= e($translations['fr']['panel_title']) ?></h2>
                    <p><?= e($translations['fr']['panel_body']) ?></p>
                    <p class="panel-note"><?= e($translations['fr']['panel_note']) ?></p>
                </section>

                <section class="footer-card">
                    <div class="mini-badge"></div>
                    <p><?= e($copy['footer_note']) ?></p>
                </section>
            </aside>
        </main>
    </div>

    <noscript>
        <style>
            .language-switch { display: none; }
            .info-panel[hidden] { display: block; }
        </style>
    </noscript>

    <script src="script.js" defer></script>
</body>
</html>
