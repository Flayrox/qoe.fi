// Package antispam fournit les gardes anti-spam, d'hygiène Unicode/XSS/URL,
// de déduplication (SHA-256 + SimHash64 + LSH inter-comptes), de cooldown
// progressif par strikes et de limitation des DM à froid.
package antispam

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash/fnv"
	"math"
	"math/bits"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/qoefi/api/internal/trust"
	"github.com/redis/go-redis/v9"
	"golang.org/x/text/unicode/norm"
)

// Bornes strictes de taille pour les différents types de contenus.
const (
	MaxThoughtRunes      = 10_000
	MaxThoughtTags       = 10
	MaxTagRunes          = 40
	MaxCommentRunes      = 4_000
	MaxDMRunes           = 4_000
	MaxArticleTitleRunes = 200
	MaxArticleBodyBytes  = 512 << 10
)

// Codes d'erreur stables exposés par RejectionError.
const (
	CodeContentTooLarge  = "CONTENT_TOO_LARGE"
	CodeSpamUnicode      = "SPAM_UNICODE"
	CodeSpamLinkLimit    = "SPAM_LINK_LIMIT"
	CodeSpamMentionLimit = "SPAM_MENTION_LIMIT"
	CodeSpamDuplicate    = "SPAM_DUPLICATE"
	CodeSpamCoordinated  = "SPAM_COORDINATED"
	CodeWriteCooldown    = "WRITE_COOLDOWN"
	CodeUnsafeURL        = "UNSAFE_URL"
	CodeUnsafeHTML       = "UNSAFE_HTML"
)

const (
	maxZeroWidthRunes     = 10
	maxCombiningRun       = 3
	maxSpamNewlines       = 40
	shortTextRuneLimit    = 600
	minFingerprintRunes   = 24
	simHashThreshold      = 3
	recentSimHashCap      = 20
	dupWindowTTL          = 5 * time.Minute
	lshWindowTTL          = 10 * time.Minute
	strikeWindowTTL       = 15 * time.Minute
	firstFreezeDuration   = 15 * time.Minute
	repeatFreezeDuration  = 1 * time.Hour
	freezeHistoryTTL      = 1 * time.Hour
	coldDMKeyTTL          = 25 * time.Hour
	followChurnWindowTTL  = 24 * time.Hour
	coordinatedMinSenders = 3
)

// RejectionError décrit un refus anti-spam ou de sécurité avec son statut HTTP,
// son code stable et un message lisible en français.
type RejectionError struct {
	HTTPStatus    int    `json:"-"`
	Code          string `json:"code"`
	Message       string `json:"message"`
	RetryAfterSec int    `json:"retryAfterSec,omitempty"`
	StrikeApplied bool   `json:"strikeApplied,omitempty"`
	Coordinated   bool   `json:"coordinated,omitempty"`
}

func (e *RejectionError) Error() string {
	return e.Message
}

func rejectBadRequest(code, msg string) *RejectionError {
	return &RejectionError{
		HTTPStatus: 400,
		Code:       code,
		Message:    msg,
	}
}

func rejectTooMany(code, msg string, retryAfterSec int, coordinated bool) *RejectionError {
	return &RejectionError{
		HTTPStatus:    429,
		Code:          code,
		Message:       msg,
		RetryAfterSec: retryAfterSec,
		Coordinated:   coordinated,
	}
}

var (
	dangerousTagRe   = regexp.MustCompile(`(?i)<\s*(script|iframe|object|embed|svg)(?:\s|>|/|$)`)
	eventHandlerRe   = regexp.MustCompile(`(?i)(?:<\s*[a-z][^>]*\s|\b)on[a-z]{2,24}\s*=`)
	dangerousAttrURL = regexp.MustCompile(`(?i)(?:href|src)\s*=\s*['"]?\s*(?:javascript|vbscript|data:text/html)\s*:`)
	urlTokenRe       = regexp.MustCompile(`(?i)\b(?:https?://[^\s<>"'\)\]]+|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"'\)\]]*)`)
	mentionTokenRe   = regexp.MustCompile(`(?:^|[^a-zA-Z0-9._%+-])@([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,39})`)
)

func isInvisibleZeroWidth(r rune) bool {
	switch r {
	case '\u200B', '\u200C', '\u200D', '\uFEFF', '\u2060', '\u00AD':
		return true
	default:
		return false
	}
}

func isCombiningMark(r rune) bool {
	return unicode.Is(unicode.Mn, r) || unicode.Is(unicode.Mc, r) || unicode.Is(unicode.Me, r)
}

// CheckUnicodeHygiene rejette l'abus de caractères invisibles (zero-width),
// le texte Zalgo (> 3 diacritiques combinants consécutifs) et le flood de retours à la ligne.
func CheckUnicodeHygiene(text string) error {
	zeroWidthCount := 0
	combiningRun := 0
	newlines := 0
	consecNewlines := 0
	maxConsecNewlines := 0
	nonWSRunes := 0

	for _, r := range text {
		if isInvisibleZeroWidth(r) {
			zeroWidthCount++
			if zeroWidthCount > maxZeroWidthRunes {
				return rejectBadRequest(CodeSpamUnicode, "Le texte contient trop de caractères invisibles.")
			}
		}

		if isCombiningMark(r) {
			combiningRun++
			if combiningRun > maxCombiningRun {
				return rejectBadRequest(CodeSpamUnicode, "Le texte contient une accumulation abusive de signes diacritiques.")
			}
		} else {
			combiningRun = 0
		}

		if r == '\n' {
			newlines++
			consecNewlines++
			if consecNewlines > maxConsecNewlines {
				maxConsecNewlines = consecNewlines
			}
		} else if r != '\r' {
			consecNewlines = 0
		}

		if !unicode.IsSpace(r) && !isInvisibleZeroWidth(r) {
			nonWSRunes++
		}
	}

	if maxConsecNewlines > maxSpamNewlines || (newlines > maxSpamNewlines && nonWSRunes < shortTextRuneLimit) {
		return rejectBadRequest(CodeSpamUnicode, "Le texte contient un nombre excessif de sauts de ligne.")
	}
	return nil
}

// ValidateSafeURL vérifie qu'une URL est soit vide (champ optionnel), soit un
// chemin relatif sûr commençant par `/`, soit une URL `http://` ou `https://`.
func ValidateSafeURL(raw string) error {
	for _, r := range raw {
		if r < 0x20 || r == 0x7f {
			return rejectBadRequest(CodeUnsafeURL, "L'URL contient des caractères de contrôle interdits.")
		}
	}

	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}

	if strings.HasPrefix(trimmed, "/") && !strings.HasPrefix(trimmed, "//") {
		return nil
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return rejectBadRequest(CodeUnsafeURL, "L'URL fournie est invalide.")
	}

	scheme := strings.ToLower(parsed.Scheme)
	if (scheme != "http" && scheme != "https") || parsed.Host == "" {
		return rejectBadRequest(CodeUnsafeURL, "Seules les URLs http://, https:// ou les chemins relatifs sont autorisés.")
	}
	return nil
}

// CheckNoXSS détecte les balises HTML dangereuses, les gestionnaires
// d'événements JS (`on*=`) et les schémas `javascript:` dans `href`/`src`
// sans déclencher de faux positifs sur la prose ou les mathématiques (`x < y`, `<3`).
func CheckNoXSS(text string) error {
	if dangerousTagRe.MatchString(text) || eventHandlerRe.MatchString(text) || dangerousAttrURL.MatchString(text) {
		return rejectBadRequest(CodeUnsafeHTML, "Le contenu contient du HTML ou des scripts potentiellement dangereux.")
	}
	return nil
}

// CountLinksAndMentions compte le nombre de liens (`http(s)://`, `www.`) et de
// mentions (`@utilisateur`) dans un texte, sans compter les adresses e-mail.
func CountLinksAndMentions(text string) (links int, mentions int) {
	links = len(urlTokenRe.FindAllStringIndex(text, -1))
	mentions = len(mentionTokenRe.FindAllStringIndex(text, -1))
	return links, mentions
}

func linkAndMentionLimits(tier trust.Tier, enforceStandard bool) (maxLinks, maxMentions int, enforce bool) {
	if tier.Level() <= trust.TierLow.Level() {
		return 1, 2, true
	}
	if enforceStandard {
		return 10, 15, true
	}
	return 0, 0, false
}

func validateText(text string, maxRunes int, tier trust.Tier, enforceStandardLinkCaps bool) error {
	if maxRunes > 0 && utf8.RuneCountInString(text) > maxRunes {
		return rejectBadRequest(CodeContentTooLarge, fmt.Sprintf("Le contenu dépasse la limite de %d caractères.", maxRunes))
	}
	if err := CheckUnicodeHygiene(text); err != nil {
		return err
	}
	if err := CheckNoXSS(text); err != nil {
		return err
	}
	if maxLinks, maxMentions, enforce := linkAndMentionLimits(tier, enforceStandardLinkCaps); enforce {
		links, mentions := CountLinksAndMentions(text)
		if links > maxLinks {
			return rejectBadRequest(CodeSpamLinkLimit, fmt.Sprintf("Trop de liens dans ce contenu (maximum %d pour votre niveau de confiance).", maxLinks))
		}
		if mentions > maxMentions {
			return rejectBadRequest(CodeSpamMentionLimit, fmt.Sprintf("Trop de mentions dans ce contenu (maximum %d pour votre niveau de confiance).", maxMentions))
		}
	}
	return nil
}

// ValidateThought valide une pensée et ses tags selon le niveau de confiance.
func ValidateThought(text string, tags []string, tier trust.Tier) error {
	if len(tags) > MaxThoughtTags {
		return rejectBadRequest(CodeContentTooLarge, fmt.Sprintf("Une pensée ne peut pas contenir plus de %d tags.", MaxThoughtTags))
	}
	for _, tag := range tags {
		if utf8.RuneCountInString(tag) > MaxTagRunes {
			return rejectBadRequest(CodeContentTooLarge, fmt.Sprintf("Un tag ne peut pas dépasser %d caractères.", MaxTagRunes))
		}
		if err := CheckUnicodeHygiene(tag); err != nil {
			return err
		}
		if err := CheckNoXSS(tag); err != nil {
			return err
		}
	}
	return validateText(text, MaxThoughtRunes, tier, true)
}

// ValidateComment valide un commentaire selon le niveau de confiance.
func ValidateComment(text string, tier trust.Tier) error {
	return validateText(text, MaxCommentRunes, tier, true)
}

// ValidateDM valide un message privé selon le niveau de confiance.
func ValidateDM(text string, tier trust.Tier) error {
	return validateText(text, MaxDMRunes, tier, true)
}

// ValidateArticle valide le titre et le corps d'un article (longueur, Unicode, XSS et liens bas niveau).
func ValidateArticle(title, body string, tier trust.Tier) error {
	if utf8.RuneCountInString(title) > MaxArticleTitleRunes {
		return rejectBadRequest(CodeContentTooLarge, fmt.Sprintf("Le titre ne peut pas dépasser %d caractères.", MaxArticleTitleRunes))
	}
	if len(body) > MaxArticleBodyBytes {
		return rejectBadRequest(CodeContentTooLarge, "Le corps de l'article dépasse la taille maximale autorisée (512 Ko).")
	}
	if err := CheckUnicodeHygiene(title); err != nil {
		return err
	}
	if err := CheckNoXSS(title); err != nil {
		return err
	}
	return validateText(body, 0, tier, false)
}

// NormalizeForFingerprint normalise un texte (NFKC, minuscules, suppression
// des URLs, chiffres et ponctuations, espaces condensés) pour le calcul d'empreintes.
func NormalizeForFingerprint(text string) string {
	nfkc := norm.NFKC.String(text)
	lower := strings.ToLower(nfkc)
	withoutURLs := urlTokenRe.ReplaceAllString(lower, " ")

	var b strings.Builder
	b.Grow(len(withoutURLs))
	for _, r := range withoutURLs {
		if unicode.IsLetter(r) {
			b.WriteRune(r)
		} else {
			b.WriteByte(' ')
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}

func fnv1a64(s string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(s))
	return h.Sum64()
}

func addWeightedFeature(weights *[64]int, feature string, w int) {
	h := fnv1a64(feature)
	for i := 0; i < 64; i++ {
		if (h>>uint(i))&1 == 1 {
			weights[i] += w
		} else {
			weights[i] -= w
		}
	}
}

func canonicalSpamToken(w string) string {
	if len(w) <= 2 {
		return w
	}
	replacer := strings.NewReplacer("ph", "f", "qu", "k", "y", "i")
	s := replacer.Replace(w)

	// Réduit les lettres doublées consécutives (ex. "gratuuiiit" -> "gratuit").
	var b strings.Builder
	b.Grow(len(s))
	var prev rune
	for i, r := range s {
		if i > 0 && r == prev {
			continue
		}
		b.WriteRune(r)
		prev = r
	}
	s = b.String()

	// Retire un 'e' ou 's' final muet sur les tokens d'au moins 5 caractères.
	if len(s) >= 5 && (strings.HasSuffix(s, "e") || strings.HasSuffix(s, "s")) {
		s = s[:len(s)-1]
	}
	return s
}

// SimHash64 calcule une empreinte SimHash sur 64 bits à partir de la forme
// normalisée (tokens canoniques pondérés, 3-shingles de mots et trigrammes de caractères).
func SimHash64(text string) uint64 {
	normalized := NormalizeForFingerprint(text)
	if normalized == "" {
		return 0
	}

	var weights [64]int
	rawWords := strings.Fields(normalized)
	words := make([]string, len(rawWords))
	for i, w := range rawWords {
		words[i] = canonicalSpamToken(w)
		addWeightedFeature(&weights, "w:"+words[i], 2)
	}
	for i := 0; i+2 < len(words); i++ {
		addWeightedFeature(&weights, "s3:"+words[i]+" "+words[i+1]+" "+words[i+2], 1)
	}

	canonText := strings.Join(words, " ")
	runes := []rune(canonText)
	for i := 0; i+2 < len(runes); i++ {
		addWeightedFeature(&weights, "c3:"+string(runes[i:i+3]), 1)
	}

	var out uint64
	for i := 0; i < 64; i++ {
		if weights[i] > 0 {
			out |= 1 << uint(i)
		}
	}
	return out
}

// HammingDistance retourne le nombre de bits différents entre deux empreintes 64 bits.
func HammingDistance(a, b uint64) int {
	return bits.OnesCount64(a ^ b)
}

// LSHBands découpe une empreinte 64 bits en 4 bandes de 16 bits pour l'indexation LSH.
// Par principe des tiroirs, deux empreintes à distance de Hamming <= 3 partagent au moins une bande.
func LSHBands(h uint64) [4]uint16 {
	return [4]uint16{
		uint16(h),
		uint16(h >> 16),
		uint16(h >> 32),
		uint16(h >> 48),
	}
}

// Guard applique les contrôles dynamiques Redis (cooldown, strikes,
// déduplication SimHash/LSH, quota de DM à froid et churn d'abonnements).
type Guard struct {
	rc *redis.Client
}

// NewGuard crée un garde anti-spam adossé à Redis (nil toléré avec dégradation sûre).
func NewGuard(rc *redis.Client) *Guard {
	return &Guard{rc: rc}
}

func freezeKey(userID string) string        { return "sec:freeze:" + userID }
func freezeHistKey(userID string) string    { return "sec:freeze_hist:" + userID }
func strikeKey(userID string) string        { return "sec:strikes:" + userID }
func dupKey(scope, userID, sha string) string { return fmt.Sprintf("sec:dup:%s:%s:%s", scope, userID, sha) }
func userSimHashKey(scope, userID string) string {
	return fmt.Sprintf("sec:sh:user:%s:%s", scope, userID)
}
func lshBandKey(scope string, band int, val uint16) string {
	return fmt.Sprintf("sec:sh:lsh:%s:%d:%04x", scope, band, val)
}

// IsWriteFrozen indique si l'utilisateur est temporairement gelé en écriture
// ainsi que le délai restant en secondes.
func (g *Guard) IsWriteFrozen(ctx context.Context, userID string) (frozen bool, retryAfter int) {
	if g == nil || g.rc == nil || userID == "" {
		return false, 0
	}
	ttl, err := g.rc.TTL(ctx, freezeKey(userID)).Result()
	if err != nil || ttl <= 0 {
		return false, 0
	}
	sec := int(math.Ceil(ttl.Seconds()))
	if sec < 1 {
		sec = 1
	}
	return true, sec
}

// ApplyStrike incrémente le compteur de strikes (TTL 15 min) et déclenche un
// gel d'écriture automatique à partir de 3 strikes (15 min, ou 1 h en cas de récidive).
func (g *Guard) ApplyStrike(ctx context.Context, userID string) (strikes int, cooldownSec int, escalated bool) {
	if g == nil || g.rc == nil || userID == "" {
		return 0, 0, false
	}

	pipe := g.rc.Pipeline()
	incrCmd := pipe.Incr(ctx, strikeKey(userID))
	pipe.Expire(ctx, strikeKey(userID), strikeWindowTTL)
	_, _ = pipe.Exec(ctx)

	n, err := incrCmd.Result()
	if err != nil {
		return 0, 0, false
	}
	strikes = int(n)
	if strikes < 3 {
		return strikes, 0, false
	}

	freezeDur := firstFreezeDuration
	if histExists, histErr := g.rc.Exists(ctx, freezeHistKey(userID)).Result(); histErr == nil && histExists > 0 {
		freezeDur = repeatFreezeDuration
		escalated = true
	}

	pipe2 := g.rc.Pipeline()
	pipe2.Set(ctx, freezeKey(userID), "1", freezeDur)
	pipe2.Set(ctx, freezeHistKey(userID), "1", freezeHistoryTTL)
	_, _ = pipe2.Exec(ctx)

	return strikes, int(freezeDur.Seconds()), escalated
}

// CheckAndRecordFingerprint vérifie l'absence de doublon exact (SHA-256), de
// quasi-doublon par auteur (SimHash Hamming <= 3) et de campagne coordonnée
// inter-comptes (>= 3 auteurs distincts via LSH), puis enregistre l'empreinte.
func (g *Guard) CheckAndRecordFingerprint(ctx context.Context, userID, scope, text string) (coordinated bool, err error) {
	normalized := NormalizeForFingerprint(text)
	if utf8.RuneCountInString(normalized) < minFingerprintRunes {
		return false, nil
	}
	if g == nil || g.rc == nil {
		return false, nil
	}

	sha := sha256.Sum256([]byte(normalized))
	shaHex := hex.EncodeToString(sha[:])
	ok, setErr := g.rc.SetNX(ctx, dupKey(scope, userID, shaHex), "1", dupWindowTTL).Result()
	if setErr == nil && !ok {
		return false, rejectTooMany(CodeSpamDuplicate, "Ce contenu identique a déjà été publié récemment.", int(dupWindowTTL.Seconds()), false)
	}

	sh := SimHash64(normalized)
	shHex := strconv.FormatUint(sh, 16)
	userKey := userSimHashKey(scope, userID)

	if recent, lErr := g.rc.LRange(ctx, userKey, 0, -1).Result(); lErr == nil {
		for _, item := range recent {
			prev, parseErr := strconv.ParseUint(item, 16, 64)
			if parseErr == nil && HammingDistance(sh, prev) <= simHashThreshold {
				return false, rejectTooMany(CodeSpamDuplicate, "Un contenu très similaire a déjà été publié récemment.", int(dupWindowTTL.Seconds()), false)
			}
		}
	}

	pipe := g.rc.Pipeline()
	pipe.LPush(ctx, userKey, shHex)
	pipe.LTrim(ctx, userKey, 0, recentSimHashCap-1)
	pipe.Expire(ctx, userKey, dupWindowTTL)
	_, _ = pipe.Exec(ctx)

	bands := LSHBands(sh)
	matchedSenders := map[string]struct{}{userID: {}}
	entry := userID + ":" + shHex

	for idx, bandVal := range bands {
		bk := lshBandKey(scope, idx, bandVal)
		members, mErr := g.rc.SMembers(ctx, bk).Result()
		if mErr == nil {
			for _, m := range members {
				otherUser, otherHashStr, found := strings.Cut(m, ":")
				if !found || otherUser == "" || otherUser == userID {
					continue
				}
				otherHash, parseErr := strconv.ParseUint(otherHashStr, 16, 64)
				if parseErr == nil && HammingDistance(sh, otherHash) <= simHashThreshold {
					matchedSenders[otherUser] = struct{}{}
				}
			}
		}

		bPipe := g.rc.Pipeline()
		bPipe.SAdd(ctx, bk, entry)
		bPipe.Expire(ctx, bk, lshWindowTTL)
		_, _ = bPipe.Exec(ctx)
	}

	if len(matchedSenders) >= coordinatedMinSenders {
		return true, rejectTooMany(
			CodeSpamCoordinated,
			"Une activité coordonnée inhabituelle a été détectée sur ce contenu.",
			int(lshWindowTTL.Seconds()),
			true,
		)
	}

	return false, nil
}

func coldDMLimitForTier(tier trust.Tier) int64 {
	switch tier {
	case trust.TierTrusted:
		return 40
	case trust.TierStandard:
		return 15
	default:
		return 5
	}
}

func secondsUntilNextUTCDay(now time.Time) int {
	next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	sec := int(math.Ceil(next.Sub(now).Seconds()))
	if sec < 1 {
		return 1
	}
	return sec
}

// CheckColdDM applique le plafond quotidien de nouveaux destinataires non-abonnés
// selon le Trust Tier (`LOW`/`RESTRICTED`: 5, `STANDARD`: 15, `TRUSTED`: 40).
func CheckColdDM(ctx context.Context, senderID, recipientID string, isFollower bool, tier trust.Tier, rc *redis.Client) error {
	if isFollower || senderID == "" || recipientID == "" || senderID == recipientID || rc == nil {
		return nil
	}

	now := time.Now().UTC()
	key := fmt.Sprintf("sec:dm:cold:%s:%s", senderID, now.Format("20060102"))

	already, err := rc.SIsMember(ctx, key, recipientID).Result()
	if err == nil && already {
		return nil
	}

	count, err := rc.SCard(ctx, key).Result()
	if err == nil && count >= coldDMLimitForTier(tier) {
		return rejectTooMany(
			CodeWriteCooldown,
			"Limite quotidienne de nouveaux destinataires atteinte pour votre niveau de confiance.",
			secondsUntilNextUTCDay(now),
			false,
		)
	}

	pipe := rc.Pipeline()
	pipe.SAdd(ctx, key, recipientID)
	pipe.Expire(ctx, key, coldDMKeyTTL)
	_, _ = pipe.Exec(ctx)
	return nil
}

// CheckColdDM délègue vers la vérification quotidienne sur le client Redis du Guard.
func (g *Guard) CheckColdDM(ctx context.Context, senderID, recipientID string, isFollower bool, tier trust.Tier) error {
	if g == nil {
		return nil
	}
	return CheckColdDM(ctx, senderID, recipientID, isFollower, tier, g.rc)
}

// TrackFollowChurn enregistre les actions de follow/unfollow sur 24h pour un
// utilisateur et le nombre d'acteurs ciblant targetID afin de détecter le churn.
func (g *Guard) TrackFollowChurn(ctx context.Context, userID, targetID string) (userChurn int64, targetActors int64, err error) {
	if g == nil || g.rc == nil || userID == "" {
		return 0, 0, nil
	}

	churnKey := "sec:follow:churn:" + userID
	pipe := g.rc.Pipeline()
	churnCmd := pipe.Incr(ctx, churnKey)
	pipe.Expire(ctx, churnKey, followChurnWindowTTL)

	var targetCmd *redis.IntCmd
	if targetID != "" {
		tk := "sec:follow:target:" + targetID
		pipe.SAdd(ctx, tk, userID)
		pipe.Expire(ctx, tk, followChurnWindowTTL)
		targetCmd = pipe.SCard(ctx, tk)
	}

	if _, execErr := pipe.Exec(ctx); execErr != nil {
		return 0, 0, execErr
	}

	userChurn, _ = churnCmd.Result()
	if targetCmd != nil {
		targetActors, _ = targetCmd.Result()
	}
	return userChurn, targetActors, nil
}
